package br.utfpr.websec.dto;
import java.time.Instant;
import java.util.UUID;

public record VerificationChallengeResponse(UUID id,String token,Instant createdAt,Long domainId,String hostname) {}
