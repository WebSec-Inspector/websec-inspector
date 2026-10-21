package br.utfpr.websec.service;

import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.User;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.Arrays;

/** Regras compartilhadas de perfil, ownership e escopo gerencial. */
@Service
public class AccessControlService {

    public boolean canAccessUser(User actor, User resourceOwner) {
        if (actor == null || resourceOwner == null) return false;
        if (actor.getRole() == User.Role.ADMINISTRADOR) return true;
        if (actor.getId() != null && actor.getId().equals(resourceOwner.getId())) return true;

        return actor.getRole() == User.Role.GERENTE
                && resourceOwner.getRole() == User.Role.CLIENTE
                && resourceOwner.getManager() != null
                && actor.getId() != null
                && actor.getId().equals(resourceOwner.getManager().getId());
    }

    /** Usa 404 fora do escopo para não revelar se o recurso de outro usuário existe. */
    public void requireResourceScope(User actor, User resourceOwner) {
        if (!canAccessUser(actor, resourceOwner)) {
            throw new ResourceNotFoundException("Recurso não encontrado");
        }
    }

    public void requireAnyRole(User actor, User.Role... allowedRoles) {
        if (actor == null || Arrays.stream(allowedRoles).noneMatch(role -> role == actor.getRole())) {
            throw new AccessDeniedException("Seu perfil não permite executar esta operação.");
        }
    }

    public void requireManagerOrAdministrator(User actor) {
        requireAnyRole(actor, User.Role.GERENTE, User.Role.ADMINISTRADOR);
    }

    public void requireAdministrator(User actor) {
        requireAnyRole(actor, User.Role.ADMINISTRADOR);
    }
}
