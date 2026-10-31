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
import org.springframework.data.redis.core.ListOperations;
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

@SpringBootTest @AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="TEST_POSTGRES_JDBC",matches=".+")
class CancelVerificationPostgresTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("spring.datasource.url",()->System.getenv("TEST_POSTGRES_JDBC"));
        r.add("spring.datasource.username",()->"websec_test");r.add("spring.datasource.password",()->"test-only");
        r.add("spring.datasource.hikari.connection-init-sql",()->"SET statement_timeout='10s'");
    }
    @Autowired MockMvc http;@Autowired JdbcTemplate jdbc;@Autowired ObjectMapper json;
    @Autowired UserRepository users;@Autowired PasswordEncoder passwords;
    @MockBean DomainVerificationService verification;@MockBean StringRedisTemplate redis;
    private final List<Long> owners=new ArrayList<>();
    @SuppressWarnings("unchecked") private final ListOperations<String,String> notifications=mock(ListOperations.class);
    @BeforeEach void notifications(){when(redis.opsForList()).thenReturn(notifications);clearInvocations(redis);}
    private String session() throws Exception {
        User u=new User();u.setName("Cancel test");u.setEmail(UUID.randomUUID()+"@example.invalid");u.setPasswordHash(passwords.encode("test-password"));
        u=users.saveAndFlush(u);owners.add(u.getId());
        return postJson("/api/auth/login",null,Map.of("email",u.getEmail(),"password","test-password"),200).get("token").asText();
    }
    private JsonNode postJson(String path,String session,Map<String,?> body,int expected)throws Exception{
        var req=post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        if(session!=null)req.header("Authorization","Bearer "+session);
        String result=http.perform(req).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return result.isEmpty()?null:json.readTree(result);
    }
    private JsonNode read(String path,String session,int expected)throws Exception{
        return json.readTree(http.perform(get(path).header("Authorization","Bearer "+session)).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private JsonNode scan(String session)throws Exception{return postJson("/api/scans",session,Map.of("url","http://localhost"),200);}
    private String cancel(JsonNode s){return "/api/scans/"+s.get("id").asLong()+"/cancel-verification";}
    private String confirm(JsonNode s){return "/api/scans/"+s.get("id").asLong()+"/confirm-verification";}
    @AfterEach void cleanup(){for(Long id:owners){
        jdbc.update("DELETE FROM verification_challenges WHERE user_id=?",id);
        jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
        jdbc.update("DELETE FROM domains WHERE user_id=?",id);jdbc.update("DELETE FROM users WHERE id=?",id);
    }}

    @Test void cancelIsPersistentIdempotentAndPreservesOtherScansAndToken()throws Exception{
        String session=session();JsonNode first=scan(session),other=scan(session);
        JsonNode result=postJson(cancel(first),session,Map.of(),200);
        assertEquals("CANCELLED",result.get("status").asText());assertFalse(result.get("finishedAt").isNull());
        assertEquals("CANCELLED",postJson(cancel(first),session,Map.of(),200).get("status").asText());
        assertEquals("CANCELLED",read("/api/scans/"+first.get("id").asLong(),session,200).get("status").asText());
        JsonNode history=read("/api/scans/domain/"+first.get("domainId").asLong()+"/history",session,200);
        assertTrue(history.toString().contains("CANCELLED"));
        assertEquals("PENDING_VERIFICATION",read("/api/scans/"+other.get("id").asLong(),session,200).get("status").asText());
        assertEquals(first.get("verificationToken"),scan(session).get("verificationToken"));
        verifyNoInteractions(verification);verify(redis,never()).opsForList();
    }

    @Test void anotherAccountCannotCancelAndAnonymousIsDenied()throws Exception{
        String alice=session(),bob=session();JsonNode first=scan(alice);
        postJson(cancel(first),bob,Map.of(),404);postJson(cancel(first),null,Map.of(),401);
        assertEquals("PENDING_VERIFICATION",read("/api/scans/"+first.get("id").asLong(),alice,200).get("status").asText());
    }

    @Test void cancellationWinsDuringSlowProofAndLateConfirmationNeverQueues()throws Exception{
        String session=session();JsonNode first=scan(session);
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        when(verification.isVerified(anyString(),anyString())).thenAnswer(inv->{entered.countDown();assertTrue(release.await(10,TimeUnit.SECONDS));return true;});
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try{
            Future<JsonNode> confirming=pool.submit(()->postJson(confirm(first),session,Map.of(),200));
            assertTrue(entered.await(5,TimeUnit.SECONDS));
            Future<JsonNode> cancelling=pool.submit(()->postJson(cancel(first),session,Map.of(),200));
            assertEquals("CANCELLED",cancelling.get(5,TimeUnit.SECONDS).get("status").asText());
            release.countDown();
            assertEquals("CANCELLED",confirming.get(10,TimeUnit.SECONDS).get("status").asText());
            assertNull(jdbc.queryForObject("SELECT verified_at FROM domains WHERE id=?",java.sql.Timestamp.class,first.get("domainId").asLong()));
            verify(redis,never()).opsForList();
        }finally{release.countDown();pool.shutdownNow();assertTrue(pool.awaitTermination(15,TimeUnit.SECONDS));}
    }

    @Test void alreadyQueuedCannotBePresentedAsCancelled()throws Exception{
        String session=session();JsonNode first=scan(session);
        when(verification.isVerified(anyString(),anyString())).thenReturn(true);
        assertEquals("QUEUED",postJson(confirm(first),session,Map.of(),200).get("status").asText());
        JsonNode conflict=postJson(cancel(first),session,Map.of(),409);
        assertEquals("SCAN_STATE_CHANGED",conflict.get("code").asText());assertEquals("QUEUED",conflict.get("status").asText());
        verify(notifications,times(1)).leftPush("scan-queue",first.get("id").asText());
    }

    @Test void twoConfirmationsOnlyPublishOneNotification()throws Exception{
        String session=session();JsonNode first=scan(session);CyclicBarrier proof=new CyclicBarrier(2);
        when(verification.isVerified(anyString(),anyString())).thenAnswer(inv->{proof.await(10,TimeUnit.SECONDS);return true;});
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try{
            Callable<JsonNode> task=()->postJson(confirm(first),session,Map.of(),200);
            Future<JsonNode> a=pool.submit(task),b=pool.submit(task);
            assertEquals("QUEUED",a.get(20,TimeUnit.SECONDS).get("status").asText());
            assertEquals("QUEUED",b.get(20,TimeUnit.SECONDS).get("status").asText());
            verify(notifications,times(1)).leftPush("scan-queue",first.get("id").asText());
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(15,TimeUnit.SECONDS));}
    }

    @Test void cancelledCannotBeConfirmedOrLoseItsPreparedChallenge()throws Exception{
        String session=session();JsonNode challenge=postJson("/api/verification-challenges",session,Map.of(),200);
        Map<String,Object> payload=Map.of("url","http://localhost","verificationChallengeId",challenge.get("id").asText());
        JsonNode first=postJson("/api/scans",session,payload,200);
        postJson(cancel(first),session,Map.of(),200);
        assertEquals("CANCELLED",postJson(confirm(first),session,Map.of(),200).get("status").asText());
        assertEquals(first.get("domainId"),read("/api/verification-challenges/"+challenge.get("id").asText(),session,200).get("domainId"));
        assertEquals(challenge.get("token"),postJson("/api/scans",session,payload,200).get("verificationToken"));
        verifyNoInteractions(verification);verify(redis,never()).opsForList();
    }
}
