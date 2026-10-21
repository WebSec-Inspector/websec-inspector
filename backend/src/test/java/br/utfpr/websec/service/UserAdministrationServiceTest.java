package br.utfpr.websec.service;

import br.utfpr.websec.dto.AdminUserResponse;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserAdministrationServiceTest {

    private UserRepository users;
    private UserAdministrationService service;
    private User admin;
    private User manager;
    private User client;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        service = new UserAdministrationService(users, new AccessControlService());
        admin = user(1L, User.Role.ADMINISTRADOR);
        manager = user(2L, User.Role.GERENTE);
        client = user(3L, User.Role.CLIENTE);
        when(users.findByEmail(admin.getEmail())).thenReturn(Optional.of(admin));
        when(users.findByEmail(client.getEmail())).thenReturn(Optional.of(client));
        when(users.findById(1L)).thenReturn(Optional.of(admin));
        when(users.findById(2L)).thenReturn(Optional.of(manager));
        when(users.findById(3L)).thenReturn(Optional.of(client));
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void apenasAdministradorPodeAlterarPerfil() {
        assertThrows(AccessDeniedException.class,
                () -> service.updateRole(client.getEmail(), manager.getId(), User.Role.GERENTE));
    }

    @Test
    void administradorPodeAtribuirGerenteAoCliente() {
        AdminUserResponse response = service.assignManager(admin.getEmail(), client.getId(), manager.getId());
        assertEquals(User.Role.CLIENTE, response.role());
        assertEquals(manager.getId(), response.managerId());
        assertSame(manager, client.getManager());
    }

    @Test
    void administradorNaoPodeAtribuirUsuarioQueNaoSejaGerente() {
        assertThrows(IllegalArgumentException.class,
                () -> service.assignManager(admin.getEmail(), client.getId(), admin.getId()));
        assertNull(client.getManager());
    }

    private static User user(Long id, User.Role role) {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", id);
        user.setRole(role);
        user.setEmail("user" + id + "@example.test");
        user.setName("User " + id);
        return user;
    }
}
