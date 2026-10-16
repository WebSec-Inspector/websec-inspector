package br.utfpr.websec.dto;

import java.time.Instant;

public record FindingResponse(
        Long id,
        String owaspCategory,
        String description,
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
