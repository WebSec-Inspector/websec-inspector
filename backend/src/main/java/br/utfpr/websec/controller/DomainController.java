package br.utfpr.websec.controller;

import br.utfpr.websec.dto.*;
import br.utfpr.websec.service.DomainService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
    private final DomainService service;
    public DomainController(DomainService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "Listar domínios ativos dentro do escopo autorizado")
    public ResponseEntity<List<DomainResponse>> list(Authentication auth) {
        return ResponseEntity.ok(service.listDomains(auth.getName()));
    }

    @PostMapping
    @Operation(summary = "Cadastrar domínio sem criar uma varredura")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Domínio criado"),
            @ApiResponse(responseCode = "200", description = "Domínio já existente ou reativado"),
            @ApiResponse(responseCode = "400", description = "Entrada ou DNS inválido"),
            @ApiResponse(responseCode = "404", description = "Proprietário fora do escopo"),
            @ApiResponse(responseCode = "409", description = "Conflito com registros históricos")
    })
    public ResponseEntity<DomainCreateResponse> create(@Valid @RequestBody CreateDomainRequest request, Authentication auth) {
        DomainCreationResult result = service.createDomain(auth.getName(), request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.response());
    }

    @PostMapping("/{id}/verify")
    @Operation(summary = "Verificar propriedade DNS TXT/meta tag sem criar varredura")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Domínio verificado"),
            @ApiResponse(responseCode = "404", description = "Domínio fora do escopo"),
            @ApiResponse(responseCode = "409", description = "Prova pendente: VERIFICATION_PENDING")})
    public ResponseEntity<DomainVerificationResponse> verify(@PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(service.verifyDomain(auth.getName(), id));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Arquivar domínio preservando o histórico de varreduras")
    @ApiResponses({@ApiResponse(responseCode = "204", description = "Domínio arquivado"),
            @ApiResponse(responseCode = "404", description = "Domínio fora do escopo"),
            @ApiResponse(responseCode = "409", description = "Há varredura pendente, na fila ou em execução")})
    public ResponseEntity<Void> archive(@PathVariable Long id, Authentication auth) {
        service.archiveDomain(auth.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
