package br.utfpr.websec.service;

import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="TEST_POSTGRES_JDBC", matches=".+")
class ScanListPostgresTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",()->System.getenv("TEST_POSTGRES_JDBC"));
        r.add("spring.datasource.username",()->"websec_test");
        r.add("spring.datasource.password",()->"test-only");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    private final List<Long> owners=new ArrayList<>();
    private User user(User.Role role,User manager) {
        User u=new User();u.setEmail(UUID.randomUUID()+"@example.invalid");u.setName("List test");
        u.setPasswordHash(passwords.encode("test-password"));u.setRole(role);u.setManager(manager);
        u=users.saveAndFlush(u);owners.add(u.getId());return u;
    }
    private String login(User u)throws Exception {
        String body=http.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("email",u.getEmail(),"password","test-password")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer "+json.readTree(body).get("token").asText();
    }
    private long domain(User u) {
        return jdbc.queryForObject("INSERT INTO domains(user_id,hostname,verification_token) VALUES (?,?,?) RETURNING id",Long.class,u.getId(),UUID.randomUUID()+".example.invalid",UUID.randomUUID().toString());
    }
    private long scan(long domain,String state) {
        return jdbc.queryForObject("INSERT INTO scans(domain_id,status,created_at) VALUES (?,?,'2026-01-01T12:00:00Z') RETURNING id",Long.class,domain,state);
    }
    private JsonNode list(String token,String query)throws Exception {
        return json.readTree(http.perform(get("/api/scans"+query).header("Authorization",token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private Set<Long> ids(JsonNode page) {
        Set<Long> result=new HashSet<>();page.get("content").forEach(row->result.add(row.get("id").asLong()));return result;
    }
    @AfterEach void cleanup() {
        for(Long id:owners) {
            jdbc.update("DELETE FROM findings WHERE scan_id IN (SELECT s.id FROM scans s JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?)",id);
            jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
            jdbc.update("DELETE FROM domains WHERE user_id=?",id);
        }
        for(int i=owners.size()-1;i>=0;i--)jdbc.update("DELETE FROM users WHERE id=?",owners.get(i));
    }
    @Test void authenticated_scope_matches_client_manager_and_admin_rules()throws Exception {
        User manager=user(User.Role.GERENTE,null),client=user(User.Role.CLIENTE,manager),outside=user(User.Role.CLIENTE,null);
        User peer=user(User.Role.GERENTE,manager),admin=user(User.Role.ADMINISTRADOR,manager);
        long own=scan(domain(manager),"QUEUED"),managed=scan(domain(client),"COMPLETED"),foreign=scan(domain(outside),"RUNNING");
        long peerScan=scan(domain(peer),"FAILED"),adminScan=scan(domain(admin),"COMPLETED");
        http.perform(get("/api/scans")).andExpect(status().isUnauthorized());
        assertEquals(Set.of(managed),ids(list(login(client),"")));
        assertEquals(Set.of(own,managed),ids(list(login(manager),"")));
        assertTrue(ids(list(login(admin),"?size=100")).containsAll(Set.of(own,managed,foreign,peerScan,adminScan)));
        long foreignDomain=jdbc.queryForObject("SELECT domain_id FROM scans WHERE id=?",Long.class,foreign);
        assertEquals(0,list(login(client),"?domainId="+foreignDomain).get("totalElements").asLong());
        assertEquals(0,list(login(client),"?domainId=9223372036854775807").get("totalElements").asLong());
    }
    @Test void stable_pages_filters_archived_history_and_severity_summaries()throws Exception {
        User u=user(User.Role.CLIENTE,null);long d=domain(u),other=domain(u);
        long low=scan(d,"COMPLETED"),critical=scan(d,"COMPLETED"),empty=scan(d,"COMPLETED"),info=scan(d,"COMPLETED");
        long deleted=scan(d,"COMPLETED");scan(other,"FAILED");
        jdbc.update("UPDATE scans SET deleted_at=now() WHERE id=?",deleted);
        jdbc.update("UPDATE domains SET is_active=false WHERE id=?",d);
        for(String severity:List.of("MEDIUM","LOW","INFORMATIONAL"))finding(low,severity);
        for(String severity:List.of("HIGH","CRITICAL","MEDIUM"))finding(critical,severity);
        finding(info,"INFORMATIONAL");
        String token=login(u),filter="?size=2&domainId="+d+"&status=COMPLETED";
        JsonNode first=list(token,filter),second=list(token,filter+"&page=1");
        assertEquals(4,first.get("totalElements").asLong());assertEquals(2,first.get("totalPages").asInt());
        assertEquals(0,first.get("page").asInt());assertEquals(2,first.get("size").asInt());
        assertEquals(info,first.get("content").get(0).get("id").asLong());assertEquals(empty,first.get("content").get(1).get("id").asLong());
        assertEquals(critical,second.get("content").get(0).get("id").asLong());
        Set<Long> combined=ids(first);combined.addAll(ids(second));assertEquals(Set.of(low,critical,empty,info),combined);
        assertEquals("INFORMATIONAL",first.get("content").get(0).get("maxSeverity").asText());
        assertTrue(first.get("content").get(1).get("maxSeverity").isNull());
        assertEquals("CRITICAL",second.get("content").get(0).get("maxSeverity").asText());
        assertEquals("MEDIUM",second.get("content").get(1).get("maxSeverity").asText());
        assertEquals(3,second.get("content").get(0).get("findingsCount").asInt());
        for(JsonNode row:first.get("content")) {assertFalse(row.get("domainActive").asBoolean());assertFalse(row.has("findings"));assertFalse(row.has("verificationToken"));}
        assertEquals(0,list(token,filter+"&page=10").get("content").size());
        assertEquals(1,list(token,"?status=FAILED").get("totalElements").asInt());
        assertEquals(20,list(token,"").get("size").asInt());
        assertEquals(100,list(token,"?size=100").get("size").asInt());
    }
    private void finding(long id,String severity) {
        jdbc.update("INSERT INTO findings(scan_id,owasp_category,description,cvss_score,severity) VALUES (?,'A01','metadata test',0,?)",id,severity);
    }
    @Test void malformed_and_out_of_bounds_filters_are_safe_bad_requests()throws Exception {
        String token=login(user(User.Role.CLIENTE,null));
        for(String query:List.of("?page=-1","?page=no","?page=2147483648","?size=0","?size=101","?size=no","?status=OTHER","?status=completed","?domainId=0","?domainId=-1","?domainId=no","?domainId=9223372036854775808"))
            http.perform(get("/api/scans"+query).header("Authorization",token)).andExpect(status().isBadRequest());
    }
}
