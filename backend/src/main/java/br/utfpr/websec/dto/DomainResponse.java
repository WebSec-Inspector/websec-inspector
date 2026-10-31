package br.utfpr.websec.dto;

import java.time.Instant;

/** Dados públicos de um domínio no escopo do ator autenticado; nunca expõe o token. */
public record DomainResponse(
        Long id,
        String hostname,
        boolean verified,
        Instant verifiedAt,
        boolean isActive
) {}
