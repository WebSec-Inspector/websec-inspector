package br.utfpr.websec.service;

import br.utfpr.websec.dto.ScanRequest;
import br.utfpr.websec.dto.ScanResponse;
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
class StableDomainTokenPostgresTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("TEST_POSTGRES_JDBC"));
        registry.add("spring.datasource.username", () -> "websec_test");
        registry.add("spring.datasource.password", () -> "test-only");
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET statement_timeout='10s'");
    }

    @Autowired ScanService service;
    @Autowired UserRepository users;
    @Autowired DomainRepository domains;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder passwords;
    private final List<Long> owners = new ArrayList<>();

    private User owner() {
        User user = new User();
        user.setEmail(UUID.randomUUID()+"@example.invalid");
        user.setPasswordHash(passwords.encode("test-password"));
        user.setName("Token test");
        user = users.saveAndFlush(user);
        owners.add(user.getId());
        return user;
    }

    private Domain published(User owner, String hostname, boolean verified) {
        Domain domain = new Domain();
        domain.setUser(owner);
        domain.setHostname(hostname);
        domain.setVerificationToken("published-"+UUID.randomUUID());
        if (verified) domain.setVerifiedAt(Instant.now());
        return domains.saveAndFlush(domain);
    }

    @AfterEach
    void cleanup() {
        for (Long id : owners) {
            jdbc.update("DELETE FROM scans WHERE domain_id IN (SELECT id FROM domains WHERE user_id=?)",id);
            jdbc.update("DELETE FROM domains WHERE user_id=?",id);
            jdbc.update("DELETE FROM users WHERE id=?",id);
        }
    }

    @Test
    void sequentialRequestsPreservePublishedUnverifiedToken() {
        User owner = owner();
        Domain domain = published(owner,"localhost",false);
        ScanResponse first = service.submitUrl(owner.getEmail(),new ScanRequest("http://localhost",null,null));
        ScanResponse second = service.submitUrl(owner.getEmail(),new ScanRequest("http://localhost",null,null));
        assertEquals(domain.getVerificationToken(),first.verificationToken());
        assertEquals(first.verificationToken(),second.verificationToken());
        assertEquals(domain.getId(),second.domainId());
    }

    @Test
    void simultaneousFirstRequestsConvergeOnOneDomainAndToken() throws Exception {
        User owner = owner();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier barrier = new CyclicBarrier(2);
        Callable<ScanResponse> submit = () -> {
            barrier.await(10,TimeUnit.SECONDS);
            return service.submitUrl(owner.getEmail(),new ScanRequest("http://localhost",null,null));
        };
        try {
            Future<ScanResponse> a = pool.submit(submit), b = pool.submit(submit);
            ScanResponse first = a.get(30,TimeUnit.SECONDS), second = b.get(30,TimeUnit.SECONDS);
            assertEquals(first.domainId(),second.domainId());
            assertEquals(first.verificationToken(),second.verificationToken());
            assertNotEquals(first.id(),second.id());
            assertEquals(1,domains.findByUserId(owner.getId()).size());
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(15,TimeUnit.SECONDS));
        }
    }

    @Test
    void legacyUppercaseHostnameKeepsItsPublishedToken() {
        User owner = owner();
        Domain domain = published(owner,"WWW.LOCALHOST",false);
        ScanResponse result = service.submitUrl(owner.getEmail(),new ScanRequest("http://LOCALHOST",null,null));
        assertEquals(domain.getId(),result.domainId());
        assertEquals(domain.getVerificationToken(),result.verificationToken());
    }

    @Test
    void verifiedTokenIsPreservedAndOtherAccountsHaveSeparateDomains() {
        User first = owner(), second = owner();
        Domain domain = published(first,"localhost",true);
        ScanResponse own = service.submitUrl(first.getEmail(),new ScanRequest("http://localhost",null,null));
        ScanResponse other = service.submitUrl(second.getEmail(),new ScanRequest("http://localhost",null,null));
        assertEquals(domain.getVerificationToken(),own.verificationToken());
        assertNotEquals(own.domainId(),other.domainId());
        assertNotEquals(own.verificationToken(),other.verificationToken());
    }

    @Test
    void ambiguousLegacyDomainsAreRejectedWithoutChangingTokens() {
        User owner = owner();
        Domain first = published(owner,"localhost",false);
        Domain second = published(owner,"LOCALHOST",false);
        assertThrows(IllegalStateException.class, () -> service.submitUrl(owner.getEmail(),new ScanRequest("http://localhost",null,null)));
        assertEquals(first.getVerificationToken(),domains.findById(first.getId()).orElseThrow().getVerificationToken());
        assertEquals(second.getVerificationToken(),domains.findById(second.getId()).orElseThrow().getVerificationToken());
    }

    private String login(User user) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("email",user.getEmail(),"password","test-password"));
        String response = http.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("token").asText();
    }

    @Test
    void repeatedWwwPrefixesStayDistinctAndLookupIsIdempotent() {
        User owner = owner();
        Domain domain = published(owner,"WWW.WWW.EXAMPLE.INVALID.",false);
        String canonical = ScanService.normalizeHostname(domain.getHostname());
        assertEquals("www.www.example.invalid",canonical);
        assertEquals(canonical,ScanService.normalizeHostname(canonical));
        assertEquals(domain.getId(),domains.findCanonicalDomains(canonical,owner.getId()).get(0).getId());
        assertEquals(domain.getId(),domains.findCanonicalDomains(canonical,owner.getId()).get(0).getId());
        assertTrue(domains.findCanonicalDomains(ScanService.normalizeHostname("www.example.invalid."),owner.getId()).isEmpty());
    }

    @Test
    void loginAgainAndReloadPendingScanKeepTheSameChallengeOverHttp() throws Exception {
        User owner = owner();
        String payload = json.writeValueAsString(java.util.Map.of("url","http://localhost"));
        String first = http.perform(post("/api/scans").header("Authorization","Bearer "+login(owner))
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String session = login(owner);
        String second = http.perform(post("/api/scans").header("Authorization","Bearer "+session)
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String reload = http.perform(get("/api/scans/"+json.readTree(first).get("id").asLong())
                        .header("Authorization","Bearer "+session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(json.readTree(first).get("verificationToken"),json.readTree(second).get("verificationToken"));
        assertEquals(json.readTree(first).get("verificationToken"),json.readTree(reload).get("verificationToken"));
    }
}
