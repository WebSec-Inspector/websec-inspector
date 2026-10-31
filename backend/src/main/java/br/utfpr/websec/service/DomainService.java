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

import java.time.Instant;
import java.util.List;

@Service
public class DomainService {
    private static final List<Scan.Status> ARCHIVE_BLOCKING = List.of(
            Scan.Status.PENDING_VERIFICATION, Scan.Status.QUEUED, Scan.Status.RUNNING);
    private final UserRepository users;
    private final DomainRepository domains;
    private final ScanRepository scans;
    private final AccessControlService access;
    private final DomainVerificationService verification;

    public DomainService(UserRepository users, DomainRepository domains, ScanRepository scans,
                         AccessControlService access, DomainVerificationService verification) {
        this.users = users;
        this.domains = domains;
        this.scans = scans;
        this.access = access;
        this.verification = verification;
    }

    @Transactional(readOnly = true)
    public List<DomainResponse> listDomains(String actorEmail) {
        User actor = actor(actorEmail);
        return domains.findAllByActiveTrueOrderByHostnameAsc().stream()
                .filter(domain -> access.canAccessUser(actor, domain.getUser()))
                .map(this::response).toList();
    }

    @Transactional
    public DomainCreationResult createDomain(String actorEmail, CreateDomainRequest request) {
        User actor = actor(actorEmail);
        String hostname = DomainHostname.fromInput(request.hostname());
        User requestedOwner = actor;
        if (request.targetUserId() != null) {
            access.requireManagerOrAdministrator(actor);
            requestedOwner = users.findById(request.targetUserId())
                    .orElseThrow(() -> new ResourceNotFoundException("Proprietário não encontrado"));
            access.requireResourceScope(actor, requestedOwner);
        }
        DomainHostname.ensureExists(hostname);
        User owner = users.findByIdForDomainCreation(requestedOwner.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Proprietário não encontrado"));
        access.requireResourceScope(actor, owner);
        List<Domain> equivalent = domains.findCanonicalDomains(hostname, owner.getId());
        if (equivalent.size() > 1) throw new IllegalStateException("Há domínios históricos equivalentes; revise os registros antes de continuar.");

        boolean created = equivalent.isEmpty();
        Domain domain;
        if (created) {
            domain = new Domain();
            domain.setUser(owner);
            domain.setHostname(hostname);
            domain.setVerificationToken(VerificationTokens.generate());
        } else {
            Domain candidate = equivalent.get(0);
            domain = domains.findByIdForUpdate(candidate.getId()).orElse(candidate);
            if (!domain.isActive()) {
                domain.setActive(true);
                domain.setVerifiedAt(null);
            }
        }
        domain = domains.save(domain);
        String token = actor.getId().equals(owner.getId()) ? domain.getVerificationToken() : null;
        return new DomainCreationResult(new DomainCreateResponse(domain.getId(), domain.getHostname(),
                domain.isVerified(), domain.getVerifiedAt(), domain.isActive(), token), created);
    }

    @Transactional
    public DomainVerificationResponse verifyDomain(String actorEmail, Long id) {
        User actor = actor(actorEmail);
        Domain domain = findInScope(id, actor);
        if (!domain.isActive()) throw new ResourceNotFoundException("Domínio não encontrado");
        if (!domain.isVerified()) {
            if (!verification.isVerified(domain.getHostname(), domain.getVerificationToken()))
                throw new DomainNotVerifiedException("Ainda não encontramos a prova de propriedade. Publique o token como DNS TXT ou na meta tag websec-verification e tente novamente.");
            domain.setVerifiedAt(Instant.now());
            domains.save(domain);
        }
        return new DomainVerificationResponse(domain.getId(), domain.getHostname(), domain.isVerified(), domain.getVerifiedAt());
    }

    @Transactional
    public void archiveDomain(String actorEmail, Long id) {
        User actor = actor(actorEmail);
        Domain domain = findInScope(id, actor);
        if (!domain.isActive()) return;
        if (scans.existsByDomainIdAndDeletedAtIsNullAndStatusIn(id, ARCHIVE_BLOCKING))
            throw new IllegalStateException("O domínio possui uma varredura pendente, na fila ou em execução. Aguarde sua conclusão antes de arquivar.");
        domain.setActive(false);
        domains.save(domain);
    }

    private Domain findInScope(Long id, User actor) {
        Domain domain = domains.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Domínio não encontrado"));
        access.requireResourceScope(actor, domain.getUser());
        return domain;
    }

    private DomainResponse response(Domain domain) {
        return new DomainResponse(domain.getId(), domain.getHostname(), domain.isVerified(),
                domain.getVerifiedAt(), domain.isActive());
    }

    private User actor(String email) {
        return users.findByEmail(email).orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
    }
}
