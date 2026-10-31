package br.utfpr.websec.service;

import br.utfpr.websec.dto.ScanResponse;
import br.utfpr.websec.dto.ScanRequest;
import br.utfpr.websec.dto.UpdateScanRequest;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.Domain;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.DomainRepository;
import br.utfpr.websec.repository.FindingRepository;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ScanServiceAuthorizationTest {

    private UserRepository users;
    private DomainRepository domains;
    private ScanRepository scans;
    private FindingRepository findings;
    private StringRedisTemplate redis;
    private DomainVerificationService verification;
    private DevelopmentBypassService bypass;
    private ScanService service;

    private User client;
    private User otherClient;
    private User manager;
    private User admin;
    private Domain clientDomain;
    private Scan clientScan;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        users = mock(UserRepository.class);
        domains = mock(DomainRepository.class);
        scans = mock(ScanRepository.class);
        findings = mock(FindingRepository.class);
        redis = mock(StringRedisTemplate.class);
        verification = mock(DomainVerificationService.class);
        bypass = mock(DevelopmentBypassService.class);
        service = new ScanService(users, domains, scans, findings, redis, verification,
                new AccessControlService(), bypass, mock(VerificationChallengeService.class));

        client = user(1L, User.Role.CLIENTE);
        otherClient = user(2L, User.Role.CLIENTE);
        manager = user(3L, User.Role.GERENTE);
        admin = user(4L, User.Role.ADMINISTRADOR);

        client.setManager(manager);
        clientDomain = new Domain();
        ReflectionTestUtils.setField(clientDomain, "id", 7L);
        clientDomain.setUser(client);
        clientDomain.setHostname("client.example.test");
        clientDomain.setVerificationToken("token");

        clientScan = new Scan();
        ReflectionTestUtils.setField(clientScan, "id", 42L);
        clientScan.setDomain(clientDomain);
        clientScan.setStatus(Scan.Status.COMPLETED);

        when(users.findByEmail(client.getEmail())).thenReturn(Optional.of(client));
        when(users.findByEmail(otherClient.getEmail())).thenReturn(Optional.of(otherClient));
        when(users.findByEmail(manager.getEmail())).thenReturn(Optional.of(manager));
        when(users.findByEmail(admin.getEmail())).thenReturn(Optional.of(admin));
        when(users.findById(1L)).thenReturn(Optional.of(client));
        when(users.findById(2L)).thenReturn(Optional.of(otherClient));
        when(users.findById(3L)).thenReturn(Optional.of(manager));
        when(users.findById(4L)).thenReturn(Optional.of(admin));
        when(users.findByIdForDomainCreation(1L)).thenReturn(Optional.of(client));
        when(users.findByIdForDomainCreation(2L)).thenReturn(Optional.of(otherClient));
        when(users.findByIdForDomainCreation(3L)).thenReturn(Optional.of(manager));
        when(users.findByIdForDomainCreation(4L)).thenReturn(Optional.of(admin));
        when(scans.findById(42L)).thenReturn(Optional.of(clientScan));
        when(findings.findByScanId(42L)).thenReturn(List.of());
    }



    @Test
    void clientePodeCriarScanParaSiMesmo() {
        when(domains.findCanonicalDomains("localhost", client.getId())).thenReturn(List.of());
        ScanResponse response = service.submitUrl(client.getEmail(),
                new ScanRequest("http://localhost", null, null));

        assertEquals("localhost", response.hostname());
        assertEquals("PENDING_VERIFICATION", response.status());
        verify(domains).findCanonicalDomains("localhost", client.getId());
    }

    @Test
    void gerentePodeCriarScanParaClienteAtribuido() {
        when(domains.findCanonicalDomains("localhost", client.getId())).thenReturn(List.of());
        ScanResponse response = service.submitUrl(manager.getEmail(),
                new ScanRequest("http://localhost", "Scan do cliente", client.getId()));

        assertEquals("localhost", response.hostname());
        assertEquals("Scan do cliente", response.name());
        verify(domains).findCanonicalDomains("localhost", client.getId());
    }

    @Test
    void clienteNaoPodeCriarScanNoNomeDeOutroUsuario() {
        assertThrows(ResourceNotFoundException.class,
                () -> service.submitUrl(client.getEmail(),
                        new ScanRequest("http://localhost", null, otherClient.getId())));
        verify(domains, never()).findCanonicalDomains(any(String.class), any(Long.class));
    }

    @Test
    void clienteConsegueConsultarProprioScan() {
        ScanResponse response = service.getScan(client.getEmail(), 42L);
        assertEquals(42L, response.id());
        assertEquals("client.example.test", response.hostname());
    }

    @Test
    void clienteNaoConsegueConsultarScanDeOutroUsuarioMesmoComIdConhecido() {
        assertThrows(ResourceNotFoundException.class,
                () -> service.getScan(otherClient.getEmail(), 42L));
        verify(findings, never()).findByScanId(42L);
    }

    @Test
    void gerentePodeConsultarScanDeClienteAtribuido() {
        ScanResponse response = service.getScan(manager.getEmail(), 42L);
        assertEquals(42L, response.id());
    }

    @Test
    void gerenteNaoPodeConsultarScanDeClienteForaDoEscopo() {
        client.setManager(otherClient); // proprietário não está mais atribuído ao gerente atual
        assertThrows(ResourceNotFoundException.class,
                () -> service.getScan(manager.getEmail(), 42L));
    }

    @Test
    void administradorPodeConsultarScanDeQualquerCliente() {
        assertEquals(42L, service.getScan(admin.getEmail(), 42L).id());
    }


    @Test
    void clienteNaoPodeConfirmarScanDeOutroUsuario() {
        assertThrows(ResourceNotFoundException.class,
                () -> service.confirmVerificationAndQueue(otherClient.getEmail(), 42L, false));
        verify(verification, never()).isVerified(any(String.class), any(String.class));
    }

    @Test
    void clienteNaoPodeUsarBypassMesmoNoProprioScan() {
        clientScan.setStatus(Scan.Status.PENDING_VERIFICATION);
        doThrow(new org.springframework.security.access.AccessDeniedException("negado"))
                .when(bypass).requireEnabledFor(client);
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> service.confirmVerificationAndQueue(client.getEmail(), 42L, true));
        verify(redis, never()).opsForList();
    }

    @Test
    void historicoValidaOwnershipDoDominioAntesDeConsultarScans() {
        when(domains.findById(7L)).thenReturn(Optional.of(clientDomain));
        assertThrows(ResourceNotFoundException.class,
                () -> service.history(otherClient.getEmail(), 7L));
        verify(scans, never()).findByDomainIdAndDeletedAtIsNullOrderByCreatedAtDesc(7L);
    }

    @Test
    void historicoDoClienteProprioEPermitido() {
        when(domains.findById(7L)).thenReturn(Optional.of(clientDomain));
        when(scans.findByDomainIdAndDeletedAtIsNullOrderByCreatedAtDesc(7L)).thenReturn(List.of(clientScan));
        List<ScanResponse> response = service.history(client.getEmail(), 7L);
        assertEquals(1, response.size());
        assertEquals(42L, response.get(0).id());
    }


    @Test
    void clienteNaoPodeAtualizarScanMesmoQueSejaProprietario() {
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> service.updateScan(client.getEmail(), 42L, new UpdateScanRequest("Nome novo")));
        verify(scans, never()).save(any(Scan.class));
    }

    @Test
    void clienteNaoPodeExcluirScanMesmoQueSejaProprietario() {
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> service.deleteScan(client.getEmail(), 42L));
        assertNull(clientScan.getDeletedAt());
    }

    @Test
    void gerentePodeAtualizarEExcluirLogicamenteScanDentroDoEscopo() {
        ScanResponse updated = service.updateScan(manager.getEmail(), 42L,
                new UpdateScanRequest("Auditoria do portal"));
        assertEquals("Auditoria do portal", updated.name());

        service.deleteScan(manager.getEmail(), 42L);
        assertNotNull(clientScan.getDeletedAt());
    }

    @Test
    void scanEnfileiradoNaoPodeSerExcluidoParaNaoInterferirNoWorker() {
        clientScan.setStatus(Scan.Status.QUEUED);
        assertThrows(IllegalStateException.class,
                () -> service.deleteScan(manager.getEmail(), 42L));
        assertNull(clientScan.getDeletedAt());
    }

    @Test
    void falhaDeNotificacaoNaoPerdeTrabalhoConfirmadoNoBanco() {
        clientScan.setStatus(Scan.Status.PENDING_VERIFICATION);
        when(verification.isVerified(anyString(), anyString())).thenReturn(true);
        when(scans.queuePending(42L)).thenReturn(1);
        when(redis.opsForList()).thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("offline"));
        ScanResponse response = service.confirmVerificationAndQueue(client.getEmail(), 42L, false);
        assertEquals("QUEUED", response.status());
        verify(scans).queuePending(42L);
    }

    @Test
    void cancelamentoNaoPermiteAcessoAOutraConta() {
        clientScan.setStatus(Scan.Status.PENDING_VERIFICATION);
        assertThrows(ResourceNotFoundException.class,()->service.cancelVerification(otherClient.getEmail(),42L));
        verify(scans,never()).cancelPending(anyLong());
    }

    @Test
    void gerenteCancelaSomenteNoEscopoPermitidoSemAlterarToken() {
        clientScan.setStatus(Scan.Status.PENDING_VERIFICATION);
        when(scans.cancelPending(42L)).thenReturn(1);
        when(scans.findState(42L)).thenReturn(Optional.of(new br.utfpr.websec.dto.ScanState(
                Scan.Status.CANCELLED,java.time.Instant.parse("2026-10-31T12:00:00Z"),null)));
        assertEquals("CANCELLED",service.cancelVerification(manager.getEmail(),42L).status());
        assertEquals("token",clientDomain.getVerificationToken());
        verify(scans).cancelPending(42L);
    }

    private static User user(Long id, User.Role role) {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", id);
        user.setRole(role);
        user.setEmail("user" + id + "@example.test");
        user.setName("User " + id);
        return user;
    }
}
