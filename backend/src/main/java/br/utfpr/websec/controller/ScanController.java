package br.utfpr.websec.controller;

import br.utfpr.websec.dto.ScanRequest;
import br.utfpr.websec.dto.ScanResponse;
import br.utfpr.websec.dto.UpdateScanRequest;
import br.utfpr.websec.service.ScanService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/scans")
@Tag(name = "Varreduras de Segurança")
public class ScanController {

    private final ScanService scanService;

    public ScanController(ScanService scanService) {
        this.scanService = scanService;
    }

    @PostMapping
    public ResponseEntity<ScanResponse> submit(Authentication auth, @Valid @RequestBody ScanRequest request) {
        return ResponseEntity.ok(scanService.submitUrl(auth.getName(), request));
    }

    @PostMapping("/{id}/confirm-verification")
    public ResponseEntity<ScanResponse> confirmVerification(
            Authentication auth,
            @PathVariable Long id,
            @RequestParam(defaultValue = "false") boolean bypass) {
        return ResponseEntity.ok(scanService.confirmVerificationAndQueue(auth.getName(), id, bypass));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ScanResponse> get(Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(scanService.getScan(auth.getName(), id));
    }

    @GetMapping("/domain/{domainId}/history")
    public ResponseEntity<List<ScanResponse>> history(Authentication auth, @PathVariable Long domainId) {
        return ResponseEntity.ok(scanService.history(auth.getName(), domainId));
    }

    /** Atualiza somente o nome/identificação do scan; não altera o estado da varredura. */
    @PreAuthorize("hasAnyRole('GERENTE', 'ADMINISTRADOR')")
    @PutMapping("/{id}")
    public ResponseEntity<ScanResponse> update(
            Authentication auth,
            @PathVariable Long id,
            @Valid @RequestBody UpdateScanRequest request) {
        return ResponseEntity.ok(scanService.updateScan(auth.getName(), id, request));
    }

    @PreAuthorize("hasAnyRole('GERENTE', 'ADMINISTRADOR')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication auth, @PathVariable Long id) {
        scanService.deleteScan(auth.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
