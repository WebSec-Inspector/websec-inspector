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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
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
    private final List<Long> owners = new ArrayList<>();

    private User owner() {
        User user = new User();
        user.setEmail(UUID.randomUUID()+"@example.invalid");
        user.setPasswordHash("test-hash");
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
}
