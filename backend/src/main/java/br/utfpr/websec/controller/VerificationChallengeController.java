package br.utfpr.websec.controller;

import br.utfpr.websec.dto.VerificationChallengeResponse;
import br.utfpr.websec.service.VerificationChallengeService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/verification-challenges")
public class VerificationChallengeController {
    private final VerificationChallengeService service;
    public VerificationChallengeController(VerificationChallengeService service){this.service=service;}
    @PostMapping
    public VerificationChallengeResponse issue(Authentication auth){return service.issue(auth.getName());}
    @GetMapping("/current")
    public ResponseEntity<VerificationChallengeResponse> current(Authentication auth){
        return service.current(auth.getName()).map(ResponseEntity::ok).orElseGet(()->ResponseEntity.noContent().build());
    }
    @GetMapping("/{id}")
    public VerificationChallengeResponse get(Authentication auth,@PathVariable String id){
        return service.get(auth.getName(),UUID.fromString(id));
    }
}
