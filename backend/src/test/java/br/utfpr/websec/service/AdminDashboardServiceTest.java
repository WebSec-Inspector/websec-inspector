package br.utfpr.websec.service;

import br.utfpr.websec.dto.AdminDashboardResponse;
import br.utfpr.websec.model.Finding;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.FindingRepository;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminDashboardServiceTest {

    @Test
    void deveBloquearUsuarioComumDeAcessarIndicadores() {
        UserRepository userRepo = mock(UserRepository.class);
        ScanRepository scanRepo = mock(ScanRepository.class);
        FindingRepository findingRepo = mock(FindingRepository.class);
        AccessControlService accessControl = new AccessControlService();

        User cliente = new User();
        cliente.setEmail("cliente@teste.com");
        cliente.setRole(User.Role.CLIENTE);
        when(userRepo.findByEmail("cliente@teste.com")).thenReturn(Optional.of(cliente));

        AdminDashboardService service = new AdminDashboardService(userRepo, scanRepo, findingRepo, accessControl);

        assertThrows(AccessDeniedException.class, () -> service.getMetrics("cliente@teste.com", 7));
    }

    @Test
    void deveRetornarIndicadoresReaisParaAdministrador() {
        UserRepository userRepo = mock(UserRepository.class);
        ScanRepository scanRepo = mock(ScanRepository.class);
        FindingRepository findingRepo = mock(FindingRepository.class);
        AccessControlService accessControl = new AccessControlService();

        User admin = new User();
        admin.setEmail("admin@teste.com");
        admin.setRole(User.Role.ADMINISTRADOR);
        when(userRepo.findByEmail("admin@teste.com")).thenReturn(Optional.of(admin));
        when(userRepo.count()).thenReturn(4L);

        Scan scanOk = new Scan();
        scanOk.setStatus(Scan.Status.COMPLETED);
        scanOk.setStartedAt(Instant.now().minusSeconds(30));
        scanOk.setFinishedAt(Instant.now());

        Scan scanFalha = new Scan();
        scanFalha.setStatus(Scan.Status.FAILED);

        when(scanRepo.findAll()).thenReturn(List.of(scanOk, scanFalha));

        Finding finding = new Finding();
        finding.setScan(scanOk);
        finding.setSeverity(Finding.Severity.HIGH);
        when(findingRepo.findAll()).thenReturn(List.of(finding));

        AdminDashboardService service = new AdminDashboardService(userRepo, scanRepo, findingRepo, accessControl);
        AdminDashboardResponse metrics = service.getMetrics("admin@teste.com", 7);

        assertEquals(4L, metrics.totalUsers());
        assertEquals(2L, metrics.totalScans());
        assertEquals(1L, metrics.processingFailures());
        assertEquals(1L, metrics.findingsBySeverity().get("HIGH"));
        assertTrue(metrics.averageExecutionSeconds() >= 29.0);
    }
}