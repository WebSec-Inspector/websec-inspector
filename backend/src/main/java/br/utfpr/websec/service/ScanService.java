package br.utfpr.websec.service;

import br.utfpr.websec.dto.*;
import br.utfpr.websec.exception.DomainNotVerifiedException;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.*;
import br.utfpr.websec.repository.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

@Service
public class ScanService {

    private static final String QUEUE_KEY = "scan-queue";

    private final UserRepository userRepository;
    private final DomainRepository domainRepository;
    private final ScanRepository scanRepository;
    private final FindingRepository findingRepository;
    private final StringRedisTemplate redisTemplate;
    private final DomainVerificationService domainVerificationService;
    private final AccessControlService accessControlService;
    private final DevelopmentBypassService developmentBypassService;

    public ScanService(UserRepository userRepository,
                       DomainRepository domainRepository,
                       ScanRepository scanRepository,
                       FindingRepository findingRepository,
                       StringRedisTemplate redisTemplate,
                       DomainVerificationService domainVerificationService,
                       AccessControlService accessControlService,
                       DevelopmentBypassService developmentBypassService) {
        this.userRepository = userRepository;
        this.domainRepository = domainRepository;
        this.scanRepository = scanRepository;
        this.findingRepository = findingRepository;
        this.redisTemplate = redisTemplate;
        this.domainVerificationService = domainVerificationService;
        this.accessControlService = accessControlService;
        this.developmentBypassService = developmentBypassService;
    }

    /** Cria um scan para o próprio usuário ou para um cliente dentro do escopo do gerente/admin. */
    @Transactional
    public ScanResponse submitUrl(String userEmail, ScanRequest request) {
        User actor = getActor(userEmail);
        User owner = actor;
        if (request.targetUserId() != null) {
            owner = userRepository.findById(request.targetUserId())
                    .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
            accessControlService.requireResourceScope(actor, owner);
        }

        String url = normalizeUrl(request.url());
        String rawHost = URI.create(url).getHost();
        if (rawHost == null) {
            throw new IllegalArgumentException("Não foi possível extrair o host da URL informada");
        }
        final String hostname = rawHost.startsWith("www.") ? rawHost.substring(4) : rawHost;
        ensureHostnameExists(hostname);

        Domain domain = findOrCreateDomain(hostname, owner);

        Scan scan = new Scan();
        scan.setDomain(domain);
        scan.setName(request.name() == null || request.name().isBlank() ? null : request.name().trim());
        scan.setStatus(Scan.Status.PENDING_VERIFICATION);
        scanRepository.save(scan);

        return toResponse(scan, List.of());
    }

    /**
     * Busca/cria domínio e trata concorrência sobre a chave única (hostname, user).
     */
    private Domain findOrCreateDomain(String hostname, User user) {
        Domain domain = domainRepository.findFirstByHostnameAndUserId(hostname, user.getId())
                .orElseGet(() -> {
                    Domain d = new Domain();
                    d.setUser(user);
                    d.setHostname(hostname);
                    d.setVerificationToken(generateVerificationToken());
                    return d;
                });

        if (!domain.isVerified()) {
            domain.setVerificationToken(generateVerificationToken());
        }

        try {
            domainRepository.save(domain);
            return domain;
        } catch (DataIntegrityViolationException e) {
            return domainRepository.findFirstByHostnameAndUserId(hostname, user.getId())
                    .orElseThrow(() -> e);
        }
    }

    /** Confirma domínio e coloca na fila; o bypass só pode ser solicitado por administrador em dev. */
    @Transactional
    public ScanResponse confirmVerificationAndQueue(String userEmail, Long scanId, boolean bypass) {
        User actor = getActor(userEmail);
        Scan scan = findScanInScope(scanId, actor);

        if (scan.getStatus() != Scan.Status.PENDING_VERIFICATION) {
            throw new IllegalStateException("Scan não está aguardando verificação (status atual: " + scan.getStatus() + ")");
        }

        Domain domain = scan.getDomain();
        if (bypass) {
            developmentBypassService.requireEnabledFor(actor);
            // O bypass é por execução de desenvolvimento; não marca o domínio como comprovado.
        } else {
            boolean verified = domainVerificationService.isVerified(domain.getHostname(), domain.getVerificationToken());
            if (!verified) {
                throw new DomainNotVerifiedException(
                        "Ainda não encontramos o registro TXT ou a meta tag de verificação para \"" +
                                domain.getHostname() + "\". A propagação de DNS pode levar alguns minutos.");
            }
            domain.setVerifiedAt(Instant.now());
            domainRepository.save(domain);
        }

        scan.setStatus(Scan.Status.QUEUED);
        scanRepository.save(scan);
        enqueueAfterCommit(scan.getId());
        return toResponse(scan, List.of());
    }

    /** Publica a mensagem somente depois do commit para que o worker enxergue o estado QUEUED. */
    private void enqueueAfterCommit(Long scanId) {
        Runnable enqueue = () -> redisTemplate.opsForList().leftPush(QUEUE_KEY, scanId.toString());
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    enqueue.run();
                }
            });
        } else {
            enqueue.run();
        }
    }

    @Transactional(readOnly = true)
    public ScanResponse getScan(String userEmail, Long scanId) {
        User actor = getActor(userEmail);
        Scan scan = findScanInScope(scanId, actor);
        return toResponse(scan, loadFindings(scanId));
    }

    @Transactional(readOnly = true)
    public List<ScanResponse> history(String userEmail, Long domainId) {
        User actor = getActor(userEmail);
        Domain domain = domainRepository.findById(domainId)
                .orElseThrow(() -> new ResourceNotFoundException("Domínio não encontrado"));
        accessControlService.requireResourceScope(actor, domain.getUser());
        return scanRepository.findByDomainIdAndDeletedAtIsNullOrderByCreatedAtDesc(domainId).stream()
                .map(scan -> toResponse(scan, loadFindings(scan.getId())))
                .toList();
    }

    /** Atualiza somente metadados; o estado é controlado pelo fluxo de processamento. */
    @Transactional
    public ScanResponse updateScan(String userEmail, Long scanId, UpdateScanRequest request) {
        User actor = getActor(userEmail);
        accessControlService.requireManagerOrAdministrator(actor);
        Scan scan = findScanInScope(scanId, actor);
        scan.setName(request.name().trim());
        scanRepository.save(scan);
        return toResponse(scan, loadFindings(scanId));
    }

    /** Exclusão lógica; scans na fila ou em execução não podem ser removidos do fluxo. */
    @Transactional
    public void deleteScan(String userEmail, Long scanId) {
        User actor = getActor(userEmail);
        accessControlService.requireManagerOrAdministrator(actor);
        Scan scan = findScanInScope(scanId, actor);
        if (scan.getStatus() == Scan.Status.QUEUED || scan.getStatus() == Scan.Status.RUNNING) {
            throw new IllegalStateException("Não é possível excluir um scan enfileirado ou em execução");
        }
        scan.setDeletedAt(Instant.now());
        scanRepository.save(scan);
    }

    private User getActor(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
    }

    private Scan findScanInScope(Long scanId, User actor) {
        Scan scan = scanRepository.findById(scanId)
                .orElseThrow(() -> new ResourceNotFoundException("Scan não encontrado"));
        if (scan.isDeleted()) {
            throw new ResourceNotFoundException("Scan não encontrado");
        }
        accessControlService.requireResourceScope(actor, scan.getDomain().getUser());
        return scan;
    }

    private List<FindingResponse> loadFindings(Long scanId) {
        return findingRepository.findByScanId(scanId).stream()
                .map(f -> new FindingResponse(f.getId(), f.getOwaspCategory(), f.getDescription(),
                        f.getCvssScore(), f.getSeverity().name(), f.getRecommendation(),
                        f.getTitle() == null ? f.getOwaspCategory() : f.getTitle(), f.getConfidence(),
                        f.getAffectedUrl(), f.getAffectedParameter(), f.getEvidence(), f.getCweId(),
                        f.getWascId(), f.getTechnicalReference(), f.getExecutionTimestamp()))
                .toList();
    }

    private ScanResponse toResponse(Scan scan, List<FindingResponse> findings) {
        Domain domain = scan.getDomain();
        return new ScanResponse(
                scan.getId(),
                domain.getHostname(),
                scan.getName(),
                scan.getStatus().name(),
                scan.getStatus() == Scan.Status.PENDING_VERIFICATION ? domain.getVerificationToken() : null,
                scan.getCreatedAt(),
                scan.getFinishedAt(),
                findings.size(),
                findings
        );
    }

    private void ensureHostnameExists(String hostname) {
        try {
            InetAddress.getByName(hostname);
        } catch (UnknownHostException e) {
            try {
                InetAddress.getByName("www." + hostname);
            } catch (UnknownHostException e2) {
                throw new IllegalArgumentException(
                        "O domínio \"" + hostname + "\" não foi encontrado. Verifique se a URL está correta.");
            }
        }
    }

    private String generateVerificationToken() {
        byte[] bytes = new byte[24];
        new SecureRandom().nextBytes(bytes);
        return "websec-verify-" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String normalizeUrl(String input) {
        String url = input.trim();
        if (!url.matches("(?i)^https?://.*")) {
            url = "https://" + url;
        }
        return url;
    }
}
