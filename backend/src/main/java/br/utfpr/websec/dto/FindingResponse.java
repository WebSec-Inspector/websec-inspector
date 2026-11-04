package br.utfpr.websec.dto;

import java.time.Instant;

public record FindingResponse(
        Long id,
        String owaspCategory,
        String description,
        @io.swagger.v3.oas.annotations.media.Schema(description="Score aproximado legado do risco ZAP; não é uma avaliação CVSS. Consulte /api/findings/{id}/cvss para vetor e nota CVSS 4.0.")
        Double cvssScore,
        String severity,
        String recommendation,
        String title,
        String confidence,
        String affectedUrl,
        String affectedParameter,
        String evidence,
        String cweId,
        String wascId,
        String technicalReference,
        Instant executionTimestamp
) {}
