package br.utfpr.websec.service;

import br.utfpr.websec.dto.AdminUserResponse;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAdministrationService {

    private final UserRepository userRepository;
    private final AccessControlService accessControlService;

    public UserAdministrationService(UserRepository userRepository, AccessControlService accessControlService) {
        this.userRepository = userRepository;
        this.accessControlService = accessControlService;
    }

    @Transactional
    public AdminUserResponse updateRole(String actorEmail, Long targetUserId, User.Role newRole) {
        if (newRole == null) {
            throw new IllegalArgumentException("O perfil é obrigatório");
        }
        User actor = getUserByEmail(actorEmail);
        accessControlService.requireAdministrator(actor);
        User target = getUserById(targetUserId);

        if (actor.getId().equals(target.getId()) && newRole != User.Role.ADMINISTRADOR) {
            throw new IllegalStateException("O administrador autenticado não pode remover o próprio perfil administrativo");
        }
        if (target.getRole() == User.Role.GERENTE
                && newRole != User.Role.GERENTE
                && userRepository.existsByManager_Id(target.getId())) {
            throw new IllegalStateException("Reatribua os clientes deste gerente antes de alterar seu perfil");
        }

        if (newRole != User.Role.CLIENTE) {
            target.setManager(null);
        }
        target.setRole(newRole);
        return toResponse(userRepository.save(target));
    }

    @Transactional
    public AdminUserResponse assignManager(String actorEmail, Long clientId, Long managerId) {
        User actor = getUserByEmail(actorEmail);
        accessControlService.requireAdministrator(actor);
        User client = getUserById(clientId);

        if (client.getRole() != User.Role.CLIENTE) {
            throw new IllegalStateException("Somente usuários com perfil CLIENTE podem ser atribuídos a um gerente");
        }

        if (managerId == null) {
            client.setManager(null);
        } else {
            User manager = getUserById(managerId);
            if (manager.getRole() != User.Role.GERENTE) {
                throw new IllegalArgumentException("O usuário informado não possui perfil GERENTE");
            }
            client.setManager(manager);
        }
        return toResponse(userRepository.save(client));
    }

    private User getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário autenticado não encontrado"));
    }

    private User getUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(user.getId(), user.getName(), user.getEmail(), user.getRole(),
                user.getManager() == null ? null : user.getManager().getId());
    }
}
