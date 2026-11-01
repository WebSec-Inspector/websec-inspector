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
class EmailDeliveryPostgresTest {
    private static final java.nio.file.Path ROOT;
    static { try { ROOT=java.nio.file.Files.createTempDirectory("reports-test-"); } catch(Exception e){throw new ExceptionInInitializerError(e);} }
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("spring.datasource.url",()->System.getenv("TEST_POSTGRES_JDBC"));
        r.add("spring.datasource.username",()->"websec_test");
        r.add("spring.datasource.password",()->"test-only");
        r.add("websec.reports.directory",()->ROOT.toString());
        r.add("websec.reports.email-enabled",()->true);
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
    private long ready(User u)throws Exception{
        long id=scan(u,"COMPLETED");String key="scan-"+id+"-fixture.pdf";
        java.nio.file.Files.writeString(ROOT.resolve(key),"%PDF-1.4 fixture");
        jdbc.update("INSERT INTO reports(scan_id,pdf_url,status) VALUES (?,?,'READY')",id,key);
        return id;
    }
    @Test void scopedRequestsUseOwnerWithoutAcceptingArbitraryRecipientsAndRemainIdempotent()throws Exception{
        User manager=owner(User.Role.GERENTE,null),u=owner(User.Role.CLIENTE,manager),other=owner(User.Role.CLIENTE,null),admin=owner(User.Role.ADMINISTRADOR,null);
        long id=ready(u);String route="/api/scans/"+id+"/report/email";
        http.perform(get(route)).andExpect(status().isUnauthorized());
        for(User actor:List.of(u,manager,admin)){
            http.perform(get(route).header("Authorization",login(actor))).andExpect(status().isOk());
            http.perform(post(route).header("Authorization",login(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toEmail\":\"attacker@example.invalid\"}")).andExpect(status().isAccepted());
        }
        assertEquals("PENDING",jdbc.queryForObject("SELECT email_status FROM reports WHERE scan_id=?",String.class,id));
        assertEquals(0,jdbc.queryForObject("SELECT email_attempt_count FROM reports WHERE scan_id=?",Integer.class,id));
        http.perform(get(route).header("Authorization",login(other))).andExpect(status().isNotFound());
        http.perform(post(route).header("Authorization",login(other))).andExpect(status().isNotFound());
        jdbc.update("UPDATE reports SET email_status='SENT',sent_at=now() WHERE scan_id=?",id);
        http.perform(post(route).header("Authorization",login(u))).andExpect(status().isAccepted());
        assertEquals("SENT",jdbc.queryForObject("SELECT email_status FROM reports WHERE scan_id=?",String.class,id));
        jdbc.update("UPDATE reports SET email_status='FAILED',email_attempt_count=3 WHERE scan_id=?",id);
        http.perform(post(route).header("Authorization",login(u))).andExpect(status().isAccepted());
        assertEquals(0,jdbc.queryForObject("SELECT email_attempt_count FROM reports WHERE scan_id=?",Integer.class,id));
    }
    @Test void missingPdfOrDeletedScanCannotRequestEmail()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long id=ready(u);String route="/api/scans/"+id+"/report/email",auth=login(u);
        jdbc.update("UPDATE reports SET pdf_url='missing.pdf',email_status='SENDING' WHERE scan_id=?",id);
        http.perform(post("/api/scans/"+id+"/report").header("Authorization",auth)).andExpect(status().isConflict());
        http.perform(post(route).header("Authorization",auth)).andExpect(status().isConflict());
        jdbc.update("UPDATE scans SET deleted_at=now() WHERE id=?",id);
        http.perform(get(route).header("Authorization",auth)).andExpect(status().isNotFound());
    }
}
