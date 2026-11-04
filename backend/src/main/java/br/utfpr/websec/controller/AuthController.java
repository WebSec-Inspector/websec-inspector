package br.utfpr.websec.controller;

import br.utfpr.websec.dto.AuthResponse;
import br.utfpr.websec.dto.LoginRequest;
import br.utfpr.websec.dto.RegisterRequest;
import br.utfpr.websec.service.AuthService;
import br.utfpr.websec.service.RefreshSessionService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Autenticação")
public class AuthController {

    private final AuthService authService;
    private final RefreshSessionService sessions;
    private final boolean cookieSecure;

    public AuthController(AuthService authService, RefreshSessionService sessions,
                          @Value("${websec.refresh.cookie-secure:true}") boolean cookieSecure) {
        this.authService = authService;
        this.sessions=sessions;
        this.cookieSecure=cookieSecure;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return authenticated(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return authenticated(authService.login(request));
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@CookieValue(name="websec_refresh",required=false) String secret) {
        var session=sessions.rotate(secret);
        if(session==null) return ResponseEntity.status(401).header(HttpHeaders.CACHE_CONTROL,"no-store")
                .header(HttpHeaders.SET_COOKIE,cookie("",0)).body(Map.of("error","Sessão expirada. Entre novamente."));
        return authenticated(session);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name="websec_refresh",required=false) String secret) {
        sessions.logout(secret);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL,"no-store")
                .header(HttpHeaders.SET_COOKIE,cookie("",0)).build();
    }

    private ResponseEntity<AuthResponse> authenticated(RefreshSessionService.Session session) {
        long remaining=Math.max(0,Duration.between(Instant.now(),session.expiresAt()).getSeconds());
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"no-store")
                .header(HttpHeaders.SET_COOKIE,cookie(session.secret(),remaining)).body(session.access());
    }
    private String cookie(String value,long seconds) {
        return ResponseCookie.from("websec_refresh",value).httpOnly(true).secure(cookieSecure)
                .sameSite("Strict").path("/api/auth").maxAge(seconds).build().toString();
    }
}
