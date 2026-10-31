package br.utfpr.websec.dto;

import java.time.Instant;

/** O token só é devolvido quando o ator também é o proprietário do domínio. */
public record DomainCreateResponse(
        Long id,
        String hostname,
        boolean verified,
        Instant verifiedAt,
        boolean isActive,
        String verificationToken
) {}
