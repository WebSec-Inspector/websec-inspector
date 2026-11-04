package br.utfpr.websec.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_JDBC", matches = ".+")
class RegistrationPostgresTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("TEST_POSTGRES_JDBC"));
        properties.add("spring.datasource.username", () -> "websec_test");
        properties.add("spring.datasource.password", () -> "test-only");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET statement_timeout='10s'");
    }

    @Autowired MockMvc http;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @SpyBean PasswordEncoder passwords;
    private final String email = UUID.randomUUID() + "@example.invalid";

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM users WHERE email=?", email);
    }

    private MvcResult register() throws Exception {
        return http.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "Registration test", "email", email,
                        "password", "test-password", "role", "ADMINISTRADOR"))))
                .andReturn();
    }

    private void assertDuplicate(MvcResult result) throws Exception {
        assertEquals(409, result.getResponse().getStatus());
        var body = json.readTree(result.getResponse().getContentAsByteArray());
        assertEquals("EMAIL_ALREADY_REGISTERED", body.path("code").asText());
        assertEquals("E-mail já cadastrado.", body.path("error").asText());
        assertEquals(2, body.size());
        assertFalse(body.has("token"));
    }

    @Test
    void duplicateEmailReturnsSafeConflictAndPublicRegistrationAlwaysCreatesClient() throws Exception {
        var first = register();
        assertEquals(200, first.getResponse().getStatus());
        assertFalse(json.readTree(first.getResponse().getContentAsByteArray()).path("token").asText().isBlank());
        assertEquals("CLIENTE", jdbc.queryForObject("SELECT role FROM users WHERE email=?", String.class, email));
        assertDuplicate(register());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM users WHERE email=?", Integer.class, email));
    }

    @Test
    void simultaneousRegistrationOfSameEmailHasOneSuccessAndOneSafeConflict() throws Exception {
        // Both requests pass the real existence query before either can insert.
        var beforeInsert = new CyclicBarrier(2);
        doAnswer(invocation -> {
            String hash = new BCryptPasswordEncoder().encode(invocation.getArgument(0));
            beforeInsert.await(10, TimeUnit.SECONDS);
            return hash;
        }).when(passwords).encode(any(CharSequence.class));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> left = pool.submit(this::register);
            Future<MvcResult> right = pool.submit(this::register);
            var a = left.get(20, TimeUnit.SECONDS);
            var b = right.get(20, TimeUnit.SECONDS);
            assertEquals(200, Math.min(a.getResponse().getStatus(), b.getResponse().getStatus()));
            assertDuplicate(a.getResponse().getStatus() == 200 ? b : a);
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM users WHERE email=?", Integer.class, email));
            assertEquals("CLIENTE", jdbc.queryForObject("SELECT role FROM users WHERE email=?", String.class, email));
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(15, TimeUnit.SECONDS));
        }
    }
}
