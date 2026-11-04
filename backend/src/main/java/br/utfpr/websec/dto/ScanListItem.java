package br.utfpr.websec.dto;

import br.utfpr.websec.model.Scan;
import java.time.Instant;

/** Summary only: findings and verification secrets never belong to the list. */
public record ScanListItem(Long id, Long domainId, String hostname, String name,
        Scan.Status status, Instant createdAt, Instant finishedAt, long findingsCount,
        String maxSeverity, boolean domainActive) {}
