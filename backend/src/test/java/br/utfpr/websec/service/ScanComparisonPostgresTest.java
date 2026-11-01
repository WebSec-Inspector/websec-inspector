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
class ScanComparisonPostgresTest {
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
        Long domain=jdbc.queryForObject("INSERT INTO domains(user_id,hostname,verification_token) VALUES (?,?,?) RETURNING id",Long.class,u.getId(),UUID.randomUUID()+".example.invalid",UUID.randomUUID().toString());
        return jdbc.queryForObject("INSERT INTO scans(domain_id,status,created_at) VALUES (?,?,now()) RETURNING id",Long.class,domain,state);
    }
    @AfterEach void cleanup()throws Exception{
        for(Long id:ids){
            jdbc.update("DELETE FROM reports WHERE scan_id IN (SELECT s.id FROM scans s JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
            jdbc.update("DELETE FROM findings WHERE scan_id IN (SELECT s.id FROM scans s JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
            jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
            jdbc.update("DELETE FROM domains WHERE user_id=?",id);
        }
        for(int i=ids.size()-1;i>=0;i--)jdbc.update("DELETE FROM users WHERE id=?",ids.get(i));
        try(var files=java.nio.file.Files.list(ROOT)){ for(var f:files.toList())java.nio.file.Files.deleteIfExists(f); }
    }
    private long[] pair(User u){
        long first=scan(u,"COMPLETED");
        long domain=jdbc.queryForObject("SELECT domain_id FROM scans WHERE id=?",Long.class,first);
        long second=jdbc.queryForObject("INSERT INTO scans(domain_id,status,created_at,finished_at) VALUES (?,'COMPLETED',now(),now()) RETURNING id",Long.class,domain);
        return new long[]{first,second};
    }
    private void finding(long id,String rule,String url,String method,String severity,String title){
        jdbc.update("INSERT INTO findings(scan_id,owasp_category,description,cvss_score,severity,title,zap_rule_id,affected_url,http_method) VALUES (?,'same-cwe',?,3,?,?,?,?,?)",id,title,severity,title,rule,url,method);
    }
    private com.fasterxml.jackson.databind.JsonNode compare(long[] pair,User u)throws Exception{
        String body=http.perform(get("/api/scans/"+pair[0]+"/compare/"+pair[1]).header("Authorization",login(u)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }
    @Test void groups_by_rule_url_method_parameter_and_reports_changes_without_title_matching()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long[] p=pair(u);
        finding(p[0],"10020-1","https://EXAMPLE.invalid:443/a#old","GET","MEDIUM","Old name");
        finding(p[0],"10020-1","https://example.invalid/a","GET","HIGH","Duplicate");
        finding(p[1],"10020-1","https://example.invalid/a#new","GET","CRITICAL","Changed description");
        finding(p[0],"10021","https://example.invalid/gone","GET","LOW","Old");
        finding(p[1],"10022","https://example.invalid/new","GET","LOW","New");
        var result=compare(p,u);
        assertTrue(result.get("complete").asBoolean());
        assertEquals(1,result.get("added").size());assertEquals(1,result.get("removed").size());
        assertEquals(1,result.get("persistent").size());
        var same=result.get("persistent").get(0);
        assertEquals("HIGH",same.get("baselineSeverity").asText());
        assertEquals("CRITICAL",same.get("comparedSeverity").asText());
        assertEquals(2,same.get("baselineOccurrences").asInt());
        assertTrue(same.get("severityChanged").asBoolean());
        assertEquals(1,result.get("duplicateBaseline").asInt());
    }
    @Test void legacy_data_never_produces_false_new_or_resolved_claims()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long[] p=pair(u);
        finding(p[0],null,"https://example.invalid/","GET","HIGH","Legacy");
        finding(p[1],"10020","https://example.invalid/","GET","HIGH","New identifiable");
        var result=compare(p,u);
        assertFalse(result.get("complete").asBoolean());
        assertEquals(1,result.get("unidentifiedBaseline").asInt());
        assertEquals(0,result.get("added").size());assertEquals(0,result.get("removed").size());
        assertEquals(1,result.get("unmatchedCompared").size());
        assertFalse(result.get("limitations").isEmpty());
    }
    @Test void methods_paths_queries_and_rule_variants_are_not_silently_merged()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long[] p=pair(u);
        finding(p[0],"10020-1","https://example.invalid/a?x=1&y=2","GET","LOW","Original");
        finding(p[1],"10020-1","https://example.invalid/a?y=2&x=1","GET","LOW","Query");
        finding(p[1],"10020-1","https://example.invalid/a?x=1&y=2","POST","LOW","Method");
        finding(p[1],"10020-2","https://example.invalid/a?x=1&y=2","GET","LOW","Variant");
        var result=compare(p,u);
        assertEquals(0,result.get("persistent").size());assertEquals(3,result.get("added").size());assertEquals(1,result.get("removed").size());
    }
    @Test void method_tokens_remain_case_sensitive()throws Exception{
        User u=owner(User.Role.CLIENTE,null);long[] p=pair(u);
        finding(p[0],"10020","https://example.invalid/","GET","LOW","Uppercase");
        finding(p[1],"10020","https://example.invalid/","get","LOW","Lowercase");
        var result=compare(p,u);
        assertEquals(0,result.get("persistent").size());assertEquals(1,result.get("added").size());assertEquals(1,result.get("removed").size());
    }
    @Test void ownership_manager_scope_state_and_same_domain_are_required()throws Exception{
        User manager=owner(User.Role.GERENTE,null),u=owner(User.Role.CLIENTE,manager),other=owner(User.Role.CLIENTE,null),admin=owner(User.Role.ADMINISTRADOR,null);
        long[] p=pair(u);String route="/api/scans/"+p[0]+"/compare/"+p[1];
        http.perform(get(route)).andExpect(status().isUnauthorized());
        for(User actor:List.of(u,manager,admin))compare(p,actor);
        http.perform(get(route).header("Authorization",login(other))).andExpect(status().isNotFound());
        long[] outsiders=pair(other);
        http.perform(get("/api/scans/"+p[0]+"/compare/"+outsiders[0]).header("Authorization",login(u))).andExpect(status().isNotFound());
        long otherDomain=scan(u,"COMPLETED");
        http.perform(get("/api/scans/"+p[0]+"/compare/"+otherDomain).header("Authorization",login(u))).andExpect(status().isConflict());
        http.perform(get("/api/scans/"+p[0]+"/compare/"+p[0]).header("Authorization",login(u))).andExpect(status().isConflict());
        jdbc.update("UPDATE scans SET status='RUNNING' WHERE id=?",p[1]);
        http.perform(get(route).header("Authorization",login(u))).andExpect(status().isConflict());
        jdbc.update("UPDATE scans SET status='COMPLETED',deleted_at=now() WHERE id=?",p[1]);
        http.perform(get(route).header("Authorization",login(u))).andExpect(status().isNotFound());
    }
}
