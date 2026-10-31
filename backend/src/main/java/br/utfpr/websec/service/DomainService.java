package br.utfpr.websec.service;

import br.utfpr.websec.dto.*;
import br.utfpr.websec.exception.DomainNotVerifiedException;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.Domain;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.DomainRepository;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

/** Regras de gestão de domínios independentes do ciclo de vida de um scan. */
@Service
public class DomainService {
    private static final List<Scan.Status> STATUSES_BLOCKING_ARCHIVE = List.of(
            Scan.Status.PENDING_VERIFICATION, Scan.Status.QUEUED, Scan.Status.RUNNING);

    private final UserRepository userRepository;
    private final DomainRepository domainRepository;
    private final ScanRepository scanRepository;
    private final AccessControlService accessControlService;
    private final DomainVerificationService verificationService;

    public DomainService(UserRepository userRepository,
                        DomainRepository domainRepository,
                        ScanRepository scanRepository,
                        AccessControlService accessControlService,
                        DomainVerificationService verificationService) {
        this.userRepository = userRepository;
        this.domainRepository = domainRepository;
        this.scanRepository = scanRepository;
        this.accessControlService = accessControlService;
        this.verificationService = verificationService;
    }

    @Transactional(readOnly = true)
    public List<DomainResponse> listDomains(String actorEmail) {
        User actor = getActor(actorEmail);
        return domainRepository.findAllByActiveTrueOrderByHostnameAsc().stream()
                .filter(domain -> accessControlService.canAccessUser(actor, domain.getUser()))
                .map(this::toResponse)
                .toList();
    }

    /** Cria sem abrir scan/fila, ou reutiliza o registro único do proprietário. */
    @Transactional
    public DomainCreationResult createDomain(String actorEmail, CreateDomainRequest request) {
        User actor = getActor(actorEmail);
        String hostname = DomainHostname.fromInput(request.hostname());

        User requestedOwner = actor;
        if (request.targetUserId() != null) {
            accessControlService.requireManagerOrAdministrator(actor);
            requestedOwner = userRepository.findById(request.targetUserId())
                    .orElseThrow(() -> new ResourceNotFoundException("Proprietário não encontrado"));
            accessControlService.requireResourceScope(actor, requestedOwner);
        }
        DomainHostname.ensureExists(hostname);

        // A trava na linha do proprietário serializa duas criações simultâneas
        // mesmo quando ainda não existe linha de domínio para bloquear.
        User owner = userRepository.findByIdForDomainCreation(requestedOwner.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Proprietário não encontrado"));
        accessControlService.requireResourceScope(actor, owner);

        List<Domain> equivalent = domainRepository.findCanonicalDomains(hostname, owner.getId());
        if (equivalent.size() > 1) {
            throw new IllegalStateException(
                    "Há registros históricos equivalentes com tokens diferentes. Revise os domínios antes de continuar.");
        }

        boolean created = equivalent.isEmpty();
        Domain domain;
        if (created) {
            domain = new Domain();
            domain.setUser(owner);
            domain.setHostname(hostname);
            domain.setVerificationToken(generateVerificationToken());
        } else {
            Domain candidate = equivalent.get(0);
            domain = domainRepository.findByIdForUpdate(candidate.getId()).orElse(candidate);
            if (!domain.isActive()) {
                domain.setActive(true);
                domain.setVerifiedAt(null);
            }
        }
        domain = domainRepository.save(domain);

        // Evita revelar token de um domínio de terceiro, mesmo para atores
        // administrativos. O proprietário pode repetir o POST para obter o seu.
        String token = actor.getId().equals(owner.getId()) ? domain.getVerificationToken() : null;
        DomainCreateResponse response = new DomainCreateResponse(
                domain.getId(), domain.getHostname(), domain.isVerified(), domain.getVerifiedAt(),
                domain.isActive(), token);
        return new DomainCreationResult(response, created);
    }

    @Transactional
    public DomainVerificationResponse verifyDomain(String actorEmail, Long domainId) {
        User actor = getActor(actorEmail);
        Domain domain = findDomainInScopeForUpdate(domainId, actor);
        if (!domain.isActive()) {
            throw new ResourceNotFoundException("Domínio não encontrado");
        }
        if (domain.isVerified()) return toVerificationResponse(domain);

        if (!verificationService.isVerified(domain.getHostname(), domain.getVerificationToken())) {
            throw new DomainNotVerifiedException(
                    "Ainda não encontramos a prova de propriedade. Publique o token como registro DNS TXT " +
                    "ou na meta tag websec-verification e tente novamente após a propagação.");
        }

        domain.setVerifiedAt(Instant.now());
        domainRepository.save(domain);
        return toVerificationResponse(domain);
    }

    /** Arquivamento lógico, preservando o domínio e todas as relações históricas. */
    @Transactional
    public void archiveDomain(String actorEmail, Long domainId) {
        User actor = getActor(actorEmail);
        Domain domain = findDomainInScopeForUpdate(domainId, actor);
        if (!domain.isActive()) return; // DELETE idempotente

        boolean hasOpenScan = scanRepository.existsByDomainIdAndDeletedAtIsNullAndStatusIn(
                domainId, STATUSES_BLOCKING_ARCHIVE);
        if (hasOpenScan) {
            throw new IllegalStateException(
                    "O domínio possui uma varredura pendente, na fila ou em execução. Aguarde sua conclusão antes de arquivar.");
        }

        domain.setActive(false);
        domainRepository.save(domain);
    }

    private Domain findDomainInScopeForUpdate(Long domainId, User actor) {
        Domain domain = domainRepository.findByIdForUpdate(domainId)
                .orElseThrow(() -> new ResourceNotFoundException("Domínio não encontrado"));
        accessControlService.requireResourceScope(actor, domain.getUser());
        return domain;
    }

    private DomainResponse toResponse(Domain domain) {
        return new DomainResponse(domain.getId(), domain.getHostname(), domain.isVerified(),
                domain.getVerifiedAt(), domain.isActive());
    }

    private DomainVerificationResponse toVerificationResponse(Domain domain) {
        return new DomainVerificationResponse(domain.getId(), domain.getHostname(), domain.isVerified(),
                domain.getVerifiedAt());
    }

    private User getActor(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
    }

    private String generateVerificationToken() {
        byte[] bytes = new byte[24];
        new SecureRandom().nextBytes(bytes);
        return "websec-verify-" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
