package br.utfpr.websec.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

public record CreateDomainRequest(
        @NotBlank(message = "Informe um domínio ou URL HTTP/HTTPS")
        @Size(max = 2048, message = "A entrada deve ter no máximo 2048 caracteres")
        @Schema(description = "Hostname ou URL HTTP/HTTPS", example = "https://example.com")
        String hostname,
        /** Omitido para criar para o próprio ator; só gerente/admin podem informar outro usuário autorizado. */
        @Schema(description = "ID do proprietário; omitido para o usuário autenticado", example = "null")
        Long targetUserId
) {}
