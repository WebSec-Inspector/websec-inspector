package br.utfpr.websec.controller;

import br.utfpr.websec.dto.CreateDomainRequest;
import br.utfpr.websec.dto.DomainCreationResult;
import br.utfpr.websec.dto.DomainResponse;
import br.utfpr.websec.dto.DomainVerificationResponse;
import br.utfpr.websec.service.DomainService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/domains")
@Tag(name = "Domínios", description = "Cadastro, verificação e arquivamento de domínios autorizados")
public class DomainController {

    private final DomainService domainService;

    public DomainController(DomainService domainService) {
        this.domainService = domainService;
    }

    @GetMapping
    @Operation(summary = "Listar domínios ativos no escopo do usuário autenticado")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Domínios ativos autorizados", content = @Content(array = @ArraySchema(schema = @Schema(implementation = DomainResponse.class)))),
            @ApiResponse(responseCode = "401", description = "Autenticação obrigatória")
    })
    public ResponseEntity<List<DomainResponse>> list(Authentication auth) {
        return ResponseEntity.ok(domainService.listDomains(auth.getName()));
    }

    @PostMapping
    @Operation(summary = "Cadastrar domínio sem criar uma varredura",
            description = "Aceita hostname ou URL HTTP/HTTPS. targetUserId é opcional e só é permitido dentro do escopo do gerente/administrador.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Novo domínio cadastrado", content = @Content(schema = @Schema(implementation = br.utfpr.websec.dto.DomainCreateResponse.class))),
            @ApiResponse(responseCode = "200", description = "Domínio já existente ou reativado", content = @Content(schema = @Schema(implementation = br.utfpr.websec.dto.DomainCreateResponse.class))),
            @ApiResponse(responseCode = "400", description = "Hostname, URL ou DNS inválido"),
            @ApiResponse(responseCode = "404", description = "Proprietário fora do escopo"),
            @ApiResponse(responseCode = "409", description = "Conflito histórico não recuperável")
    })
    public ResponseEntity<br.utfpr.websec.dto.DomainCreateResponse> create(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "Hostname/URL e, opcionalmente, ID do proprietário",
                    content = @Content(schema = @Schema(implementation = CreateDomainRequest.class), examples = @ExampleObject(value = "{\"hostname\":\"https://example.com\",\"targetUserId\":null}")))
            @Valid @RequestBody CreateDomainRequest request, Authentication auth) {
        DomainCreationResult result = domainService.createDomain(auth.getName(), request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(result.response());
    }

    @PostMapping("/{id}/verify")
    @Operation(summary = "Verificar propriedade por DNS TXT ou meta tag, sem criar uma varredura")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Propriedade comprovada", content = @Content(schema = @Schema(implementation = DomainVerificationResponse.class))),
            @ApiResponse(responseCode = "404", description = "Domínio fora do escopo ou inexistente"),
            @ApiResponse(responseCode = "409", description = "Prova ainda não publicada", content = @Content(schema = @Schema(example = "{\"code\":\"VERIFICATION_PENDING\",\"error\":\"...\"}")))
    })
    public ResponseEntity<DomainVerificationResponse> verify(
            @Parameter(description = "ID do domínio") @PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(domainService.verifyDomain(auth.getName(), id));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Arquivar domínio sem apagar varreduras ou histórico")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Domínio arquivado"),
            @ApiResponse(responseCode = "404", description = "Domínio fora do escopo ou inexistente"),
            @ApiResponse(responseCode = "409", description = "Há varredura pendente, na fila ou em execução")
    })
    public ResponseEntity<Void> archive(
            @Parameter(description = "ID do domínio") @PathVariable Long id, Authentication auth) {
        domainService.archiveDomain(auth.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
