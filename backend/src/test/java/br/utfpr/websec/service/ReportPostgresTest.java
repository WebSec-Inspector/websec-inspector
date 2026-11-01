package br.utfpr.websec.service;

import br.utfpr.websec.dto.ScanRequest;
import br.utfpr.websec.dto.ScanResponse;
import br.utfpr.websec.dto.CreateDomainRequest;
import br.utfpr.websec.dto.DomainCreationResult;
import br.utfpr.websec.model.Domain;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.DomainRepository;
import br.utfpr.websec.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="TEST_POSTGRES_JDBC", matches=".+")
class ReportPostgresTest {
    private static final java.nio.file.Path ROOT;
    static { try { ROOT=java.nio.file.Files.createTempDirectory("reports-test-"); } catch(Exception e){throw new ExceptionInInitializerError(e);} }
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("spring.datasource.url",()->System.getenv("TEST_POSTGRES_JDBC"));
        r.add("spring.datasource.username",()->"websec_test");
        r.add("spring.datasource.password",()->"test-only");
        r.add("websec.reports.directory",()->ROOT.toString());
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    private final List<Long> ids=new ArrayList<>();
    private User owner(User.Role role, User manager){
        User u=new User();u.setEmail(UUID.randomUUID()+"@example.invalid");u.setName("Report test");
        u.setPasswordHash(passwords.encode("test-password"));u.setRole(role);u.setManager(manager);
        u=users.saveAndFlush(u);ids.add(u.getId());return u;
    }
    private String login(User u)throws Exception{
        String response=http.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(java.util.Map.of("email",u.getEmail(),"password","test-password"))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer "+json.readTree(response).get("token").asText();
    }
    private long scan(User u,String state){
        Long domain=jdbc.queryForObject("INSERT INTO domains(user_id,hostname,verification_token) VALUES (?,?,?) RETURNING id",Long.class,u.getId(),"example.invalid",UUID.randomUUID().toString());
        return jdbc.queryForObject("INSERT INTO scans(domain_id,status,created_at) VALUES (?,?,now()) RETURNING id",Long.class,domain,state);
    }
    @AfterEach void cleanup()throws Exception{
        for(Long id:ids){
            jdbc.update("DELETE FROM reports WHERE scan_id IN (SELECT s.id FROM scans s JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
            jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
            jdbc.update("DELETE FROM domains WHERE user_id=?",id);
        }
        for(int i=ids.size()-1;i>=0;i--)jdbc.update("DELETE FROM users WHERE id=?",ids.get(i));
        try(var files=java.nio.file.Files.list(ROOT)){ for(var f:files.toList())java.nio.file.Files.deleteIfExists(f); }
    }
    @Test void disabledDeliveryCannotQueueAnyEmail()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long id=scan(u,"COMPLETED");String auth=login(u);
        String body=http.perform(get("/api/scans/"+id+"/report/email").header("Authorization",auth))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertFalse(json.readTree(body).get("enabled").asBoolean());
        http.perform(post("/api/scans/"+id+"/report/email").header("Authorization",auth)).andExpect(status().isConflict());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM reports WHERE scan_id=?",Integer.class,id));
    }
    @Test void legacyCompletedScanCanRequestPdfIdempotentlyWithoutRequeueingZap()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long id=scan(u,"COMPLETED");String auth=login(u);
        http.perform(get("/api/scans/"+id+"/report").header("Authorization",auth)).andExpect(status().isOk());
        for(int i=0;i<2;i++)http.perform(post("/api/scans/"+id+"/report").header("Authorization",auth)).andExpect(status().isAccepted());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM reports WHERE scan_id=?",Integer.class,id));
        assertEquals("COMPLETED",jdbc.queryForObject("SELECT status FROM scans WHERE id=?",String.class,id));
        http.perform(get("/api/scans/"+id+"/report/download").header("Authorization",auth)).andExpect(status().isConflict());
        jdbc.update("UPDATE reports SET status='FAILED' WHERE scan_id=?",id);
        http.perform(post("/api/scans/"+id+"/report").header("Authorization",auth)).andExpect(status().isAccepted());
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM reports WHERE scan_id=?",String.class,id));
    }
    @Test void downloadRequiresOwnershipOrManagerScopeAndRejectsMissingOrUnsafeFiles()throws Exception{
        User manager=owner(User.Role.GERENTE,null),u=owner(User.Role.CLIENTE,manager),other=owner(User.Role.CLIENTE,null),admin=owner(User.Role.ADMINISTRADOR,null);
        long id=scan(u,"COMPLETED");
        http.perform(get("/api/scans/"+id+"/report/download")).andExpect(status().isUnauthorized());
        String key="scan-"+id+"-fixture.pdf";
        java.nio.file.Files.write(ROOT.resolve(key),"%PDF-1.4\nfixture".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        jdbc.update("INSERT INTO reports(scan_id,pdf_url,status) VALUES (?,?,'READY')",id,key);
        for(User actor:List.of(u,manager,admin)){
            var result=http.perform(get("/api/scans/"+id+"/report/download").header("Authorization",login(actor)))
                .andExpect(status().isOk()).andReturn().getResponse();
            assertEquals("application/pdf",result.getContentType());assertTrue(result.getHeader("Cache-Control").contains("no-store"));
            assertTrue(result.getContentAsString().startsWith("%PDF"));
        }
        User outsideManager=owner(User.Role.GERENTE,null);
        http.perform(get("/api/scans/"+id+"/report/download").header("Authorization",login(outsideManager))).andExpect(status().isNotFound());
        String stranger=login(other);
        for(String suffix:List.of("/report","/report/download"))http.perform(get("/api/scans/"+id+suffix).header("Authorization",stranger)).andExpect(status().isNotFound());
        http.perform(post("/api/scans/"+id+"/report").header("Authorization",stranger)).andExpect(status().isNotFound());
        jdbc.update("UPDATE reports SET pdf_url='../escape.pdf' WHERE scan_id=?",id);
        http.perform(get("/api/scans/"+id+"/report/download").header("Authorization",login(u))).andExpect(status().isConflict());
        jdbc.update("UPDATE reports SET pdf_url='missing.pdf' WHERE scan_id=?",id);
        http.perform(get("/api/scans/"+id+"/report/download").header("Authorization",login(u))).andExpect(status().isConflict());
        http.perform(post("/api/scans/"+id+"/report").header("Authorization",login(u))).andExpect(status().isAccepted());
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM reports WHERE scan_id=?",String.class,id));
        java.nio.file.Files.writeString(ROOT.resolve("corrupt.pdf"),"invalid PDF");
        jdbc.update("UPDATE reports SET status='READY',pdf_url='corrupt.pdf' WHERE scan_id=?",id);
        var corrupt=http.perform(get("/api/scans/"+id+"/report").header("Authorization",login(u)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("MISSING",json.readTree(corrupt).get("status").asText());
        http.perform(post("/api/scans/"+id+"/report").header("Authorization",login(u))).andExpect(status().isAccepted());
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM reports WHERE scan_id=?",String.class,id));
        jdbc.update("UPDATE scans SET deleted_at=now() WHERE id=?",id);
        http.perform(get("/api/scans/"+id+"/report").header("Authorization",login(u))).andExpect(status().isNotFound());
    }
    @Test void cannotGenerateBeforeScanCompletes()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long id=scan(u,"RUNNING");
        http.perform(post("/api/scans/"+id+"/report").header("Authorization",login(u))).andExpect(status().isConflict());
    }
}
