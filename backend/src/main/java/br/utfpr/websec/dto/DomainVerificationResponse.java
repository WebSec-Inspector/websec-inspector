package br.utfpr.websec.dto;

import java.time.Instant;

public record DomainVerificationResponse(Long id, String hostname, boolean verified,
                                         Instant verifiedAt) {}
