package br.utfpr.websec.service;

import br.utfpr.websec.dto.AuthResponse;
import br.utfpr.websec.model.User;
import br.utfpr.websec.security.JwtService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class RefreshSessionService {
    // No generated toString(): a session contains a credential and must never be logged.
    public static final class Session {
        private final AuthResponse access;
        private final String secret;
        private final Instant expiresAt;
        Session(AuthResponse access, String secret, Instant expiresAt) {
            this.access=access;this.secret=secret;this.expiresAt=expiresAt;
        }
        public AuthResponse access() {return access;}
        public String secret() {return secret;}
        public Instant expiresAt() {return expiresAt;}
    }
    private record Family(UUID id, long userId, Instant expiresAt, boolean revoked) {}
    private static final Duration FAMILY_LIFETIME=Duration.ofDays(7);
    private final SecureRandom random=new SecureRandom();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final JwtService jwt;

    public RefreshSessionService(JdbcTemplate jdbc, PlatformTransactionManager manager, JwtService jwt) {
        this.jdbc=jdbc;this.transactions=new TransactionTemplate(manager);this.jwt=jwt;
    }

    public Session start(User user) {
        return transactions.execute(tx -> {
            UUID family=UUID.randomUUID();Instant expires=Instant.now().plus(FAMILY_LIFETIME);
            jdbc.update("INSERT INTO refresh_families(id,user_id,expires_at) VALUES (?,?,?)",family,user.getId(),Timestamp.from(expires));
            return issue(family,user.getEmail(),expires);
        });
    }

    /** A null result is deliberately returned AFTER committing replay/expiry revocation. */
    public Session rotate(String secret) {
        if (!wellFormed(secret)) return null;
        String hash=hash(secret);
        return transactions.execute(tx -> {
            Family family=lockFamily(hash);
            if (family==null) return null;
            if (family.revoked() || !family.expiresAt().isAfter(Instant.now())) {
                revoke(family.id());return null;
            }
            // This read is a fresh READ COMMITTED statement after obtaining the family
            // lock. It sees consumption by a concurrent node that just released it.
            Boolean consumed=jdbc.queryForObject("SELECT consumed_at IS NOT NULL FROM refresh_tokens WHERE token_hash=?",Boolean.class,hash);
            if (Boolean.TRUE.equals(consumed)) {revoke(family.id());return null;}
            int changed=jdbc.update("UPDATE refresh_tokens SET consumed_at=now() WHERE token_hash=? AND consumed_at IS NULL",hash);
            if(changed!=1) {revoke(family.id());return null;}
            String email=jdbc.queryForObject("SELECT email FROM users WHERE id=?",String.class,family.userId());
            return issue(family.id(),email,family.expiresAt());
        });
    }

    public void logout(String secret) {
        if (!wellFormed(secret)) return;
        transactions.executeWithoutResult(tx -> {
            Family family=lockFamily(hash(secret));
            if(family!=null) revoke(family.id());
        });
    }

    private Family lockFamily(String hash) {
        var families=jdbc.query("""
                SELECT f.id,f.user_id,f.expires_at,f.revoked_at FROM refresh_families f
                WHERE f.id=(SELECT family_id FROM refresh_tokens WHERE token_hash=?) FOR UPDATE
                """,(rs,n)->new Family(rs.getObject("id",UUID.class),rs.getLong("user_id"),
                rs.getTimestamp("expires_at").toInstant(),rs.getTimestamp("revoked_at")!=null),hash);
        return families.isEmpty()?null:families.get(0);
    }
    private void revoke(UUID family) {
        jdbc.update("UPDATE refresh_families SET revoked_at=COALESCE(revoked_at,now()) WHERE id=?",family);
    }
    private Session issue(UUID family,String email,Instant expires) {
        byte[] bytes=new byte[32];random.nextBytes(bytes);
        String secret=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("INSERT INTO refresh_tokens(id,family_id,token_hash) VALUES (?,?,?)",UUID.randomUUID(),family,hash(secret));
        return new Session(new AuthResponse(jwt.generateToken(email)),secret,expires);
    }
    private static boolean wellFormed(String secret) {return secret!=null && secret.matches("[A-Za-z0-9_-]{43}");}
    private static String hash(String secret) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.US_ASCII)));}
        catch(NoSuchAlgorithmException impossible) {throw new IllegalStateException("SHA-256 unavailable",impossible);}
    }
}
