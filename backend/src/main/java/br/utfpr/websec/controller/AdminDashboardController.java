package br.utfpr.websec.controller;

import br.utfpr.websec.dto.AdminDashboardResponse;
import br.utfpr.websec.service.AdminDashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMINISTRADOR')")
@Tag(name = "Visao Administrativa")
public class AdminDashboardController {

    private final AdminDashboardService adminDashboardService;

    public AdminDashboardController(AdminDashboardService adminDashboardService) {
        this.adminDashboardService = adminDashboardService;
    }

    @GetMapping({"/dashboard", "/metrics"})
    @Operation(summary = "Obter indicadores operacionais e de uso da plataforma (restrito a ADMIN)")
    public ResponseEntity<AdminDashboardResponse> getDashboardMetrics(
            Authentication auth,
            @RequestParam(defaultValue = "7") int days) {
        return ResponseEntity.ok(adminDashboardService.getMetrics(auth.getName(), days));
    }
}