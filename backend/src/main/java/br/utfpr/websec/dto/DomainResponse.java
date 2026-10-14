package br.utfpr.websec.dto;

import java.time.Instant;

/** Domínio do usuário autenticado, origem do domainId usado no Dashboard. */
public record DomainResponse(
        Long id,
        String hostname,
        boolean verified,
        Instant verifiedAt
) {}
