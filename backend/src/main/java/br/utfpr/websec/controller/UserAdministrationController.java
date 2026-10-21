package br.utfpr.websec.controller;

import br.utfpr.websec.dto.AdminUserResponse;
import br.utfpr.websec.dto.AssignManagerRequest;
import br.utfpr.websec.dto.UpdateUserRoleRequest;
import br.utfpr.websec.service.UserAdministrationService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMINISTRADOR')")
@Tag(name = "Administração de Usuários")
public class UserAdministrationController {

    private final UserAdministrationService userAdministrationService;

    public UserAdministrationController(UserAdministrationService userAdministrationService) {
        this.userAdministrationService = userAdministrationService;
    }

    @PutMapping("/{userId}/role")
    public ResponseEntity<AdminUserResponse> updateRole(
            Authentication auth,
            @PathVariable Long userId,
            @Valid @RequestBody UpdateUserRoleRequest request) {
        return ResponseEntity.ok(userAdministrationService.updateRole(auth.getName(), userId, request.role()));
    }

    @PutMapping("/{userId}/manager")
    public ResponseEntity<AdminUserResponse> assignManager(
            Authentication auth,
            @PathVariable Long userId,
            @RequestBody AssignManagerRequest request) {
        return ResponseEntity.ok(
                userAdministrationService.assignManager(auth.getName(), userId, request.managerId()));
    }
}
