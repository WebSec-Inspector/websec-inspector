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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="TEST_POSTGRES_JDBC",matches=".+")
class VerificationChallengePostgresTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",()->System.getenv("TEST_POSTGRES_JDBC"));
        r.add("spring.datasource.username",()->"websec_test");
        r.add("spring.datasource.password",()->"test-only");
        r.add("spring.datasource.hikari.connection-init-sql",()->"SET statement_timeout='10s'");
    }
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @MockBean DomainVerificationService verification;
    @MockBean StringRedisTemplate redis;
    private final List<Long> owners = new ArrayList<>();

    private User owner() {
        User u = new User();
        u.setName("Challenge test"); u.setEmail(UUID.randomUUID()+"@example.invalid");
        u.setPasswordHash(passwords.encode("test-password"));
        u=users.saveAndFlush(u); owners.add(u.getId()); return u;
    }
    private String login(User user) throws Exception {
        return request("/api/auth/login",null,Map.of("email",user.getEmail(),"password","test-password"),200).get("token").asText();
    }
    private JsonNode request(String path,String auth,Map<String,?> data,int expected) throws Exception {
        var request=post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(data));
        if(auth!=null) request.header("Authorization","Bearer "+auth);
        String response=http.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return response.isEmpty()?null:json.readTree(response);
    }
    private JsonNode read(String path,String auth,int expected) throws Exception {
        String response=http.perform(get(path).header("Authorization","Bearer "+auth))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return response.isEmpty()?null:json.readTree(response);
    }
    private int count(String table,User user) {
        String query=table.equals("scans")?"SELECT count(*) FROM scans s JOIN domains d ON d.id=s.domain_id WHERE d.user_id=?":"SELECT count(*) FROM domains WHERE user_id=?";
        return jdbc.queryForObject(query,Integer.class,user.getId());
    }
    @AfterEach void cleanup() {
        boolean challenges=jdbc.queryForObject("SELECT to_regclass('verification_challenges')::text",String.class)!=null;
        for(Long id:owners) {
            if(challenges) jdbc.update("DELETE FROM verification_challenges WHERE user_id=?",id);
            jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
            jdbc.update("DELETE FROM domains WHERE user_id=?",id);
            jdbc.update("DELETE FROM users WHERE id=?",id);
        }
    }

    @Test void issuePersistsAcrossLoginWithoutDomainScanOrQueue() throws Exception {
        User u=owner(); String session=login(u);
        read("/api/verification-challenges/current",session,204);
        JsonNode first=request("/api/verification-challenges",session,Map.of(),200);
        JsonNode second=request("/api/verification-challenges",session,Map.of(),200);
        assertEquals(first.get("id"),second.get("id"));
        assertEquals(first.get("token"),read("/api/verification-challenges/current",login(u),200).get("token"));
        assertTrue(first.get("token").asText().startsWith("websec-verify-"));
        assertEquals(0,count("domains",u)); assertEquals(0,count("scans",u));
        verifyNoInteractions(verification,redis);
    }

    @Test void bindReusesPublishedTokenAndCannotSkipOwnershipProof() throws Exception {
        User u=owner(); String session=login(u);
        JsonNode challenge=request("/api/verification-challenges",session,Map.of(),200);
        JsonNode scan=request("/api/scans",session,Map.of("url","http://localhost","verificationChallengeId",challenge.get("id").asText()),200);
        assertEquals(challenge.get("token"),scan.get("verificationToken"));
        assertEquals("PENDING_VERIFICATION",scan.get("status").asText());
        read("/api/verification-challenges/current",session,204);
        request("/api/scans/"+scan.get("id").asLong()+"/confirm-verification",session,Map.of(),409);
        assertEquals("PENDING_VERIFICATION",read("/api/scans/"+scan.get("id").asLong(),session,200).get("status").asText());
        when(verification.isVerified("localhost",challenge.get("token").asText())).thenReturn(true);
        when(redis.opsForList()).thenReturn(mock(org.springframework.data.redis.core.ListOperations.class));
        JsonNode queued=request("/api/scans/"+scan.get("id").asLong()+"/confirm-verification",session,Map.of(),200);
        assertEquals("QUEUED",queued.get("status").asText());
    }

    @Test void anotherAccountCannotReadOrAssociateChallenge() throws Exception {
        User alice=owner(),bob=owner(); String own=login(alice), other=login(bob);
        JsonNode challenge=request("/api/verification-challenges",own,Map.of(),200);
        read("/api/verification-challenges/"+challenge.get("id").asText(),other,404);
        request("/api/scans",other,Map.of("url","http://not-real.invalid","verificationChallengeId",challenge.get("id").asText()),404);
        assertEquals(0,count("domains",bob));
    }

    @Test void existingDomainReturnsExplicitConflictAndKeepsBothTokens() throws Exception {
        User u=owner(); String session=login(u);
        JsonNode existing=request("/api/scans",session,Map.of("url","http://localhost"),200);
        JsonNode challenge=request("/api/verification-challenges",session,Map.of(),200);
        JsonNode conflict=request("/api/scans",session,Map.of("url","http://localhost","verificationChallengeId",challenge.get("id").asText()),409);
        assertEquals("EXISTING_DOMAIN_TOKEN",conflict.get("code").asText());
        assertEquals(existing.get("verificationToken"),conflict.get("existingToken"));
        assertEquals(challenge.get("token"),read("/api/verification-challenges/current",session,200).get("token"));
        assertEquals(1,count("scans",u));
        assertEquals(existing.get("verificationToken"),request("/api/scans",session,Map.of("url","http://localhost"),200).get("verificationToken"));
    }

    @Test void challengeCannotBeReboundToAnotherDomain() throws Exception {
        User u=owner(); String session=login(u);
        JsonNode challenge=request("/api/verification-challenges",session,Map.of(),200);
        Map<String,Object> initial=Map.of("url","http://localhost","verificationChallengeId",challenge.get("id").asText());
        JsonNode first=request("/api/scans",session,initial,200);
        assertEquals(first.get("verificationToken"),request("/api/scans",session,initial,200).get("verificationToken"));
        request("/api/scans",session,Map.of("url","http://127.0.0.1","verificationChallengeId",challenge.get("id").asText()),409);
        assertEquals(1,count("domains",u));
    }
}
