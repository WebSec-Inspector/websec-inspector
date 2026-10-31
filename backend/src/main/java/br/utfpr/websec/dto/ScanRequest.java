package br.utfpr.websec.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record ScanRequest(
        @NotBlank
        @Pattern(regexp = "^(https?://.+|[\\w-]+(\\.[\\w-]+)+.*)$", message = "URL invalida. Informe um hostname (ex.: example.com) ou URL completa (ex.: https://example.com)")
        String url,
        @Size(max = 120, message = "O nome do scan deve ter no máximo 120 caracteres")
        String name,
        /** Opcional: permite a gerente/admin criar scan no contexto de um cliente autorizado. */
        Long targetUserId,
        UUID verificationChallengeId
) {
    public ScanRequest(String url,String name,Long targetUserId){this(url,name,targetUserId,null);}
}
