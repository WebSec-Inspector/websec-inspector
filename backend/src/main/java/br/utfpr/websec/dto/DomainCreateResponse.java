package br.utfpr.websec.dto;

import java.time.Instant;

public record DomainCreateResponse(Long id, String hostname, boolean verified,
                                   Instant verifiedAt, boolean isActive,
                                   String verificationToken) {}
