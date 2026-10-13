package br.utfpr.websec.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Atualiza somente metadados editáveis; o estado do scanner não é controlado pela API CRUD. */
public record UpdateScanRequest(
        @NotBlank(message = "O nome do scan é obrigatório")
        @Size(max = 120, message = "O nome do scan deve ter no máximo 120 caracteres")
        String name
) {}
