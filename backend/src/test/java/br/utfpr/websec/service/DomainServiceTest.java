package br.utfpr.websec.service;

import br.utfpr.websec.dto.CreateDomainRequest;
import br.utfpr.websec.dto.DomainCreationResult;
import br.utfpr.websec.exception.DomainNotVerifiedException;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.Domain;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.DomainRepository;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DomainServiceTest {
    private UserRepository users;
    private DomainRepository domains;
    private ScanRepository scans;
    private DomainVerificationService verification;
    private DomainService service;
    private User client;
    private User manager;
    private User otherClient;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        domains = mock(DomainRepository.class);
        scans = mock(ScanRepository.class);
        verification = mock(DomainVerificationService.class);
        service = new DomainService(users, domains, scans, new AccessControlService(), verification);

        client = user(1L, User.Role.CLIENTE, "client@test.invalid");
        manager = user(2L, User.Role.GERENTE, "manager@test.invalid");
        otherClient = user(3L, User.Role.CLIENTE, "other@test.invalid");
        client.setManager(manager);

        when(users.findByEmail(client.getEmail())).thenReturn(Optional.of(client));
        when(users.findByEmail(manager.getEmail())).thenReturn(Optional.of(manager));
        when(users.findByEmail(otherClient.getEmail())).thenReturn(Optional.of(otherClient));
        when(users.findById(1L)).thenReturn(Optional.of(client));
        when(users.findById(2L)).thenReturn(Optional.of(manager));
        when(users.findById(3L)).thenReturn(Optional.of(otherClient));
        when(users.findByIdForDomainCreation(anyLong())).thenAnswer(call -> {
            Long id = call.getArgument(0);
            return users.findById(id);
        });
        when(domains.save(any(Domain.class))).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void listaApenasDominiosAtivosDoProprioUsuarioEClientesVinculados() {
        Domain own = domain(11L, manager, "manager.test.invalid", true);
        Domain assigned = domain(12L, client, "client.test.invalid", true);
        Domain foreign = domain(13L, otherClient, "other.test.invalid", true);
        Domain archived = domain(14L, client, "archived.test.invalid", false);
        when(domains.findAllByActiveTrueOrderByHostnameAsc()).thenReturn(List.of(own, assigned, foreign));

        var result = service.listDomains(manager.getEmail());

        assertEquals(List.of(11L, 12L), result.stream().map(item -> item.id()).toList());
        assertTrue(result.stream().allMatch(item -> item.isActive()));
        assertFalse(result.stream().anyMatch(item -> item.id().equals(archived.getId())));
    }

    @Test
    void criaDomínioSemCriarScanEDevolveTokenApenasAoProprietario() {
        when(domains.findCanonicalDomains("localhost", client.getId())).thenReturn(List.of());

        DomainCreationResult result = service.createDomain(client.getEmail(), new CreateDomainRequest("http://localhost/path", null));

        assertTrue(result.created());
        assertEquals("localhost", result.response().hostname());
        assertTrue(result.response().isActive());
        assertNotNull(result.response().verificationToken());
        assertNull(result.response().verifiedAt());
        verify(scans, never()).save(any());
        verify(domains).save(any(Domain.class));
    }

    @Test
    void cadastroIdempotenteMantemMesmoIdEToken() {
        Domain existing = domain(20L, client, "localhost", true);
        existing.setVerificationToken("published-token");
        when(domains.findCanonicalDomains("localhost", client.getId())).thenReturn(List.of(existing));
        when(domains.findByIdForUpdate(20L)).thenReturn(Optional.of(existing));

        DomainCreationResult result = service.createDomain(client.getEmail(), new CreateDomainRequest("localhost", null));

        assertFalse(result.created());
        assertEquals(20L, result.response().id());
        assertEquals("published-token", result.response().verificationToken());
        assertNull(result.response().verifiedAt());
    }

    @Test
    void reativaRegistroArquivadoSemRotacionarTokenEExigeNovaProva() {
        Domain archived = domain(21L, client, "localhost", false);
        archived.setVerificationToken("published-token");
        archived.setVerifiedAt(Instant.parse("2026-01-01T00:00:00Z"));
        when(domains.findCanonicalDomains("localhost", client.getId())).thenReturn(List.of(archived));
        when(domains.findByIdForUpdate(21L)).thenReturn(Optional.of(archived));

        DomainCreationResult result = service.createDomain(client.getEmail(), new CreateDomainRequest("localhost", null));

        assertFalse(result.created());
        assertTrue(archived.isActive());
        assertNull(archived.getVerifiedAt());
        assertEquals("published-token", result.response().verificationToken());
    }

    @Test
    void gerenteNaoPodeCadastrarDominioParaClienteForaDoEscopo() {
        assertThrows(ResourceNotFoundException.class, () -> service.createDomain(
                manager.getEmail(), new CreateDomainRequest("localhost", otherClient.getId())));
        verify(domains, never()).save(any());
    }



    @Test
    void clienteNaoPodeInformarTargetUserIdNemMesmoOProprio() {
        assertThrows(org.springframework.security.access.AccessDeniedException.class, () -> service.createDomain(
                client.getEmail(), new CreateDomainRequest("localhost", client.getId())));
        verify(domains, never()).save(any());
    }

    @Test
    void gerentePodeCriarParaClienteVinculadoMasNaoRecebeTokenDoTerceiro() {
        when(domains.findCanonicalDomains("localhost", client.getId())).thenReturn(List.of());

        DomainCreationResult result = service.createDomain(manager.getEmail(),
                new CreateDomainRequest("localhost", client.getId()));

        assertTrue(result.created());
        assertEquals("localhost", result.response().hostname());
        assertNull(result.response().verificationToken());
    }

    @Test
    void verificarDominioJaVerificadoEhIdempotenteSemNovaConsultaDns() {
        Domain domain = domain(32L, client, "localhost", true);
        domain.setVerifiedAt(Instant.parse("2026-02-01T00:00:00Z"));
        when(domains.findByIdForUpdate(32L)).thenReturn(Optional.of(domain));

        var response = service.verifyDomain(client.getEmail(), 32L);

        assertTrue(response.verified());
        assertEquals(domain.getVerifiedAt(), response.verifiedAt());
        verify(verification, never()).isVerified(anyString(), anyString());
    }

    @Test
    void verificacaoSoPreencheVerifiedAtDepoisDaProva() {
        Domain domain = domain(30L, client, "localhost", true);
        domain.setVerificationToken("proof-token");
        when(domains.findByIdForUpdate(30L)).thenReturn(Optional.of(domain));
        when(verification.isVerified("localhost", "proof-token")).thenReturn(true);

        var response = service.verifyDomain(client.getEmail(), 30L);

        assertTrue(response.verified());
        assertNotNull(response.verifiedAt());
        verify(scans, never()).save(any());
    }

    @Test
    void verificacaoPendenteRetornaEstadoEspecificoSemMarcarDominio() {
        Domain domain = domain(31L, client, "localhost", true);
        domain.setVerificationToken("proof-token");
        when(domains.findByIdForUpdate(31L)).thenReturn(Optional.of(domain));
        when(verification.isVerified("localhost", "proof-token")).thenReturn(false);

        assertThrows(DomainNotVerifiedException.class, () -> service.verifyDomain(client.getEmail(), 31L));
        assertNull(domain.getVerifiedAt());
    }

    @Test
    void arquivamentoBloqueiaExecucoesAbertasENaoApagaHistorico() {
        Domain domain = domain(40L, client, "localhost", true);
        when(domains.findByIdForUpdate(40L)).thenReturn(Optional.of(domain));
        when(scans.existsByDomainIdAndDeletedAtIsNullAndStatusIn(eq(40L), anyList())).thenReturn(true);

        assertThrows(IllegalStateException.class, () -> service.archiveDomain(client.getEmail(), 40L));
        assertTrue(domain.isActive());
        verify(domains, never()).delete(any(Domain.class));
    }

    @Test
    void arquivaLogicamenteQuandoNaoHaScanAberto() {
        Domain domain = domain(41L, client, "localhost", true);
        when(domains.findByIdForUpdate(41L)).thenReturn(Optional.of(domain));
        when(scans.existsByDomainIdAndDeletedAtIsNullAndStatusIn(eq(41L), anyList())).thenReturn(false);

        service.archiveDomain(client.getEmail(), 41L);

        assertFalse(domain.isActive());
        verify(domains).save(domain);
        verify(domains, never()).delete(any(Domain.class));
    }

    @Test
    void consultaDeIdForaDoEscopoNaoRevelaExistencia() {
        Domain domain = domain(50L, otherClient, "other.test.invalid", true);
        when(domains.findByIdForUpdate(50L)).thenReturn(Optional.of(domain));

        assertThrows(ResourceNotFoundException.class, () -> service.verifyDomain(client.getEmail(), 50L));
        verify(verification, never()).isVerified(anyString(), anyString());
    }

    private static User user(Long id, User.Role role, String email) {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", id);
        user.setRole(role);
        user.setEmail(email);
        user.setName(email);
        return user;
    }

    private static Domain domain(Long id, User owner, String hostname, boolean active) {
        Domain domain = new Domain();
        ReflectionTestUtils.setField(domain, "id", id);
        domain.setUser(owner);
        domain.setHostname(hostname);
        domain.setVerificationToken("token-" + id);
        domain.setActive(active);
        return domain;
    }
}
