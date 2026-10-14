package br.utfpr.websec.dto;

import java.time.Instant;
import java.util.List;

/**
 * `domainId` é exposto para que o frontend possa consultar
 * GET /api/scans/domain/{domainId}/history sem recorrer a valor fixo
 * ou a uma busca por hostname (issue #48).
 */
public record ScanResponse(
        Long id,
        Long domainId,
        String hostname,
        String status,
        String verificationToken,
        Instant createdAt,
        Instant finishedAt,
        List<FindingResponse> findings
) {}
