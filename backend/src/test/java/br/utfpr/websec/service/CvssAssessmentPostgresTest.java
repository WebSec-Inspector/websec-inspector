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
class CvssAssessmentPostgresTest {
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
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('finding_cvss_history') IS NOT NULL",Boolean.class))) {
                jdbc.update("DELETE FROM finding_cvss_history WHERE finding_id IN (SELECT f.id FROM findings f JOIN scans s ON s.id=f.scan_id JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
                jdbc.update("DELETE FROM finding_cvss_assessments WHERE finding_id IN (SELECT f.id FROM findings f JOIN scans s ON s.id=f.scan_id JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
            }
            jdbc.update("DELETE FROM findings WHERE scan_id IN (SELECT s.id FROM scans s JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
            jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
            jdbc.update("DELETE FROM domains WHERE user_id=?",id);
        }
        for(int i=ids.size()-1;i>=0;i--)jdbc.update("DELETE FROM users WHERE id=?",ids.get(i));
        try(var files=java.nio.file.Files.list(ROOT)){ for(var f:files.toList())java.nio.file.Files.deleteIfExists(f); }
    }
    private static final String VECTOR="CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N";
    private long finding(User u){
        long scan=scan(u,"COMPLETED");
        return jdbc.queryForObject("INSERT INTO findings(scan_id,owasp_category,description,cvss_score,severity) VALUES (?,'A01','Evidence',3,'LOW') RETURNING id",Long.class,scan);
    }
    private String body(String vector,long revision)throws Exception{
        return json.writeValueAsString(java.util.Map.of("vector",vector,"justification","Reprodução controlada e impacto avaliado.","expectedRevision",revision,"score",0));
    }
    @Test void official_base_vectors_are_calculated_and_incomplete_or_extra_metrics_rejected()throws Exception{
        User actor=owner(User.Role.CLIENTE,null);String auth=login(actor);
        String route="/api/cvss/v4/base/preview";
        http.perform(post(route).contentType(MediaType.APPLICATION_JSON).content(body(VECTOR,0))).andExpect(status().isUnauthorized());
        for(var entry:java.util.Map.of(VECTOR,9.3,
            "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H",10.0,
            "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N",0.0,
            "CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:N/SC:H/SI:L/SA:H",6.4).entrySet()){
            String response=http.perform(post(route).header("Authorization",auth).contentType(MediaType.APPLICATION_JSON).content(body(entry.getKey(),0)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertEquals(entry.getValue(),json.readTree(response).get("score").asDouble(),.0001);
            assertEquals("4.0",json.readTree(response).get("version").asText());
        }
        for(String bad:List.of(VECTOR.replace("/SA:N",""),VECTOR+"/AV:N",VECTOR+"/E:A",VECTOR.replace("AV:N","AV:X"),VECTOR.replace("4.0","3.1")))
            http.perform(post(route).header("Authorization",auth).contentType(MediaType.APPLICATION_JSON).content(body(bad,0))).andExpect(status().isBadRequest());
    }
    @Test void scoped_manual_assessment_is_audited_and_invalidates_pdf_without_overwriting_zap_score()throws Exception{
        User manager=owner(User.Role.GERENTE,null),u=owner(User.Role.CLIENTE,manager),other=owner(User.Role.GERENTE,null);
        long id=finding(u),scan=jdbc.queryForObject("SELECT scan_id FROM findings WHERE id=?",Long.class,id);
        String route="/api/findings/"+id+"/cvss";
        String initial=http.perform(get(route).header("Authorization",login(u))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(json.readTree(initial).get("assessment").isNull());assertFalse(json.readTree(initial).get("canAssess").asBoolean());
        http.perform(put(route).header("Authorization",login(u)).contentType(MediaType.APPLICATION_JSON).content(body(VECTOR,0))).andExpect(status().isForbidden());
        http.perform(get(route).header("Authorization",login(other))).andExpect(status().isNotFound());
        http.perform(put(route).header("Authorization",login(other)).contentType(MediaType.APPLICATION_JSON).content(body(VECTOR,0))).andExpect(status().isNotFound());
        jdbc.update("INSERT INTO reports(scan_id,pdf_url,status,worker_token,lease_until) VALUES (?,'old.pdf','GENERATING',?::uuid,now()+interval '1 minute')",scan,UUID.randomUUID().toString());
        String response=http.perform(put(route).header("Authorization",login(manager)).contentType(MediaType.APPLICATION_JSON).content(body(VECTOR,0)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(9.3,json.readTree(response).get("assessment").get("score").asDouble(),.0001);
        assertEquals(1,json.readTree(response).get("assessment").get("revision").asLong());
        assertEquals(3.0,jdbc.queryForObject("SELECT cvss_score FROM findings WHERE id=?",Double.class,id));
        assertEquals("COMPLETED",jdbc.queryForObject("SELECT status FROM scans WHERE id=?",String.class,scan));
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM reports WHERE scan_id=?",String.class,scan));
        assertNull(jdbc.queryForObject("SELECT worker_token FROM reports WHERE scan_id=?",String.class,scan));
        http.perform(put(route).header("Authorization",login(manager)).contentType(MediaType.APPLICATION_JSON).content(body(VECTOR,0))).andExpect(status().isConflict());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM finding_cvss_history WHERE finding_id=?",Integer.class,id));
        http.perform(put(route).header("Authorization",login(manager)).contentType(MediaType.APPLICATION_JSON).content(body(VECTOR,1))).andExpect(status().isOk());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM finding_cvss_history WHERE finding_id=?",Integer.class,id));
        jdbc.update("UPDATE scans SET deleted_at=now() WHERE id=?",scan);
        http.perform(get(route).header("Authorization",login(manager))).andExpect(status().isNotFound());
    }
}
