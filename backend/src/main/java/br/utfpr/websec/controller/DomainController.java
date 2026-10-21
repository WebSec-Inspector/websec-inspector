package br.utfpr.websec.controller;

import br.utfpr.websec.dto.DomainResponse;
import br.utfpr.websec.service.ScanService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/domains")
@Tag(name = "Domínios")
public class DomainController {

    private final ScanService scanService;

    public DomainController(ScanService scanService) {
        this.scanService = scanService;
    }

    /**
     * Lista apenas os domínios do usuário autenticado — o frontend usa esta
     * lista para resolver o domainId do histórico sem hardcode.
     */
    @GetMapping
    public ResponseEntity<List<DomainResponse>> list(Authentication auth) {
        return ResponseEntity.ok(scanService.listDomains(auth.getName()));
    }
}
