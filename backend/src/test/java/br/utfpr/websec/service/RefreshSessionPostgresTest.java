package br.utfpr.websec.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import br.utfpr.websec.security.JwtService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.*;
import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="TEST_POSTGRES_JDBC", matches=".+")
class RefreshSessionPostgresTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", () -> System.getenv("TEST_POSTGRES_JDBC"));
        p.add("spring.datasource.username", () -> "websec_test");
        p.add("spring.datasource.password", () -> "test-only");
        p.add("spring.datasource.hikari.connection-init-sql", () -> "SET statement_timeout='10s'");
    }
    @Autowired MockMvc http;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired DataSource dataSource;
    @Autowired JwtService jwt;
    String email=UUID.randomUUID()+"@example.invalid";
    @AfterEach void cleanup() {jdbc.update("DELETE FROM users WHERE email=?",email);}

    MvcResult register() throws Exception {
        var r=http.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(
                json.writeValueAsString(Map.of("name","Session test","email",email,"password","test-password")))).andReturn();
        assertEquals(200,r.getResponse().getStatus());return r;
    }
    MvcResult login() throws Exception {
        return http.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(
                json.writeValueAsString(Map.of("email",email,"password","test-password")))).andReturn();
    }
    Cookie cookie(MvcResult r) {
        var c=r.getResponse().getCookie("websec_refresh");assertNotNull(c,"auth must issue opaque refresh cookie");return c;
    }
    MvcResult refresh(Cookie c) throws Exception {return http.perform(post("/api/auth/refresh").cookie(c)).andReturn();}
    String hash(Cookie c) throws Exception {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(c.getValue().getBytes(StandardCharsets.US_ASCII)));}

    @Test void loginAndRegisterPreserveTokenContractAndSetSecureNonCacheableCookieWithOnlyHashAtRest() throws Exception {
        var r=register();var c=cookie(r);
        assertTrue(c.isHttpOnly());assertTrue(c.getSecure());assertEquals("/api/auth",c.getPath());
        assertNull(c.getDomain());assertEquals("Strict",c.getAttribute("SameSite"));
        assertTrue(c.getMaxAge()>0 && c.getMaxAge()<=604800);
        assertEquals("no-store",r.getResponse().getHeader("Cache-Control"));
        assertEquals(2,json.readTree(r.getResponse().getContentAsByteArray()).size());
        assertEquals("Bearer",json.readTree(r.getResponse().getContentAsByteArray()).path("tokenType").asText());
        assertFalse(json.readTree(r.getResponse().getContentAsByteArray()).path("token").asText().isBlank());
        assertTrue(c.getValue().matches("[A-Za-z0-9_-]{43}"));
        assertEquals(hash(c),jdbc.queryForObject("SELECT token_hash FROM refresh_tokens WHERE token_hash=?",String.class,hash(c)));
        assertNotEquals(c.getValue(),hash(c));
        var login=login();assertEquals(200,login.getResponse().getStatus());assertNotEquals(c.getValue(),cookie(login).getValue());
    }

    @Test void rotationConsumesParentAndReuseCommitsFamilyRevocationIncludingNewChildButNotOtherLogin() throws Exception {
        Cookie parent=cookie(register());Cookie other=cookie(login());
        var rotated=refresh(parent);assertEquals(200,rotated.getResponse().getStatus());Cookie child=cookie(rotated);
        assertNotEquals(parent.getValue(),child.getValue());
        assertNotNull(jdbc.queryForObject("SELECT consumed_at FROM refresh_tokens WHERE token_hash=?",java.sql.Timestamp.class,hash(parent)));
        var replay=refresh(parent);assertEquals(401,replay.getResponse().getStatus());
        assertEquals(0,cookie(replay).getMaxAge());
        assertNotNull(jdbc.queryForObject("SELECT revoked_at FROM refresh_families WHERE id=(SELECT family_id FROM refresh_tokens WHERE token_hash=?)",java.sql.Timestamp.class,hash(parent)));
        assertEquals(401,refresh(child).getResponse().getStatus());
        assertEquals(200,refresh(other).getResponse().getStatus());
    }

    @Test void absoluteExpiryIsNotExtendedAndExpiredFamilyCannotRotate() throws Exception {
        Cookie parent=cookie(register());
        var expiry=jdbc.queryForObject("SELECT expires_at FROM refresh_families WHERE id=(SELECT family_id FROM refresh_tokens WHERE token_hash=?)",java.sql.Timestamp.class,hash(parent));
        Cookie child=cookie(refresh(parent));
        assertEquals(expiry,jdbc.queryForObject("SELECT expires_at FROM refresh_families WHERE id=(SELECT family_id FROM refresh_tokens WHERE token_hash=?)",java.sql.Timestamp.class,hash(child)));
        jdbc.update("UPDATE refresh_families SET expires_at=now()-interval '1 second' WHERE id=(SELECT family_id FROM refresh_tokens WHERE token_hash=?)",hash(child));
        assertEquals(401,refresh(child).getResponse().getStatus());
    }

    @Test void logoutRevokesCurrentFamilyIdempotentlyIncludingWhenGivenConsumedCookie() throws Exception {
        Cookie parent=cookie(register());Cookie other=cookie(login());Cookie child=cookie(refresh(parent));
        var out=http.perform(post("/api/auth/logout").cookie(parent)).andReturn();
        assertEquals(204,out.getResponse().getStatus());assertEquals(0,cookie(out).getMaxAge());
        assertTrue(cookie(out).isHttpOnly());assertTrue(cookie(out).getSecure());
        assertEquals(204,http.perform(post("/api/auth/logout").cookie(parent)).andReturn().getResponse().getStatus());
        assertEquals(401,refresh(child).getResponse().getStatus());assertEquals(200,refresh(other).getResponse().getStatus());
    }

    @Test void concurrentRotationsSerializeInPostgresWithOneSuccessAndOneReplayRevokingWinner() throws Exception {
        Cookie parent=cookie(register());var gate=new CyclicBarrier(2);var pool=Executors.newFixedThreadPool(2);
        try {
            Callable<MvcResult> call=()->{gate.await(10,TimeUnit.SECONDS);return refresh(parent);};
            var a=pool.submit(call);var b=pool.submit(call);var left=a.get(20,TimeUnit.SECONDS);var right=b.get(20,TimeUnit.SECONDS);
            assertEquals(200,Math.min(left.getResponse().getStatus(),right.getResponse().getStatus()));
            assertEquals(401,Math.max(left.getResponse().getStatus(),right.getResponse().getStatus()));
            Cookie winner=cookie(left.getResponse().getStatus()==200?left:right);
            assertEquals(401,refresh(winner).getResponse().getStatus());
            assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE family_id=(SELECT family_id FROM refresh_tokens WHERE token_hash=?)",Integer.class,hash(parent)));
        } finally {pool.shutdownNow();assertTrue(pool.awaitTermination(15,TimeUnit.SECONDS));}
    }

    @Test void independentServiceInstancesCoordinateThroughPostgresAndLogoutCannotMissConcurrentChild() throws Exception {
        Cookie parent=cookie(register());
        var nodeA=new RefreshSessionService(new JdbcTemplate(dataSource),new DataSourceTransactionManager(dataSource),jwt);
        var nodeB=new RefreshSessionService(new JdbcTemplate(dataSource),new DataSourceTransactionManager(dataSource),jwt);
        var gate=new CyclicBarrier(2);var pool=Executors.newFixedThreadPool(2);
        try {
            var rotation=pool.submit(()->{gate.await(10,TimeUnit.SECONDS);return nodeA.rotate(parent.getValue());});
            var logout=pool.submit(()->{gate.await(10,TimeUnit.SECONDS);nodeB.logout(parent.getValue());return true;});
            var child=rotation.get(20,TimeUnit.SECONDS);assertTrue(logout.get(20,TimeUnit.SECONDS));
            if(child!=null) assertNull(nodeB.rotate(child.secret()));
            assertNull(nodeA.rotate(parent.getValue()));
        } finally {pool.shutdownNow();assertTrue(pool.awaitTermination(15,TimeUnit.SECONDS));}
    }

    @Test void accessTokenLifetimeIsFifteenMinutesAndRevocationIsExplicitlyBoundedByItsExpiry() throws Exception {
        var r=register();String access=json.readTree(r.getResponse().getContentAsByteArray()).path("token").asText();
        var claims=json.readTree(Base64.getUrlDecoder().decode(access.split("\\.")[1]));
        assertEquals(900,claims.path("exp").asLong()-claims.path("iat").asLong());
        assertTrue(jwt.isValid(access));
        assertEquals(204,http.perform(post("/api/auth/logout").cookie(cookie(r))).andReturn().getResponse().getStatus());
        assertEquals(200,http.perform(get("/api/domains").header("Authorization","Bearer "+access)).andReturn().getResponse().getStatus());
    }

    @Test void missingMalformedUnknownCookiesFailSafelyAndCrossOriginCannotMutateRefreshOrLogout() throws Exception {
        assertEquals(401,http.perform(post("/api/auth/refresh")).andReturn().getResponse().getStatus());
        for(String secret:new String[]{"malformed","A".repeat(43)}) {
            var r=refresh(new Cookie("websec_refresh",secret));assertEquals(401,r.getResponse().getStatus());
            assertFalse(r.getResponse().getContentAsString().contains(secret));
        }
        Cookie c=cookie(register());
        for(String endpoint:new String[]{"refresh","logout"}) {
            assertEquals(403,http.perform(post("/api/auth/"+endpoint).cookie(c).header("Origin","https://attacker.invalid")).andReturn().getResponse().getStatus());
        }
        assertEquals(200,refresh(c).getResponse().getStatus());
        var allowed=http.perform(options("/api/auth/refresh").header("Origin","http://localhost:5173")
                .header("Access-Control-Request-Method","POST")).andReturn().getResponse();
        assertEquals("http://localhost:5173",allowed.getHeader("Access-Control-Allow-Origin"));
        assertEquals("true",allowed.getHeader("Access-Control-Allow-Credentials"));
    }
}
