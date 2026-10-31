package br.utfpr.websec.dto;

/** Metadado interno para escolher 201 (novo registro) ou 200 (idempotente/reativado). */
public record DomainCreationResult(DomainCreateResponse response, boolean created) {}
