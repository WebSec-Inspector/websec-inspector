package br.utfpr.websec.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateDomainRequest(
        @NotBlank @Size(max = 2048) String hostname,
        Long targetUserId
) {}
