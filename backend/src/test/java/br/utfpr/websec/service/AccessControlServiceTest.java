package br.utfpr.websec.service;

import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class AccessControlServiceTest {

    private final AccessControlService access = new AccessControlService();

    @Test
    void clienteSomenteAcessaPropriosRecursos() {
        User cliente = user(1L, User.Role.CLIENTE);
        User outroCliente = user(2L, User.Role.CLIENTE);

        assertTrue(access.canAccessUser(cliente, cliente));
        assertFalse(access.canAccessUser(cliente, outroCliente));
        assertThrows(ResourceNotFoundException.class,
                () -> access.requireResourceScope(cliente, outroCliente));
    }

    @Test
    void gerenteAcessaPropriosRecursosEClientesAtribuidos() {
        User gerente = user(10L, User.Role.GERENTE);
        User clienteAtribuido = user(11L, User.Role.CLIENTE);
        clienteAtribuido.setManager(gerente);
        User clienteDeOutroGerente = user(12L, User.Role.CLIENTE);
        clienteDeOutroGerente.setManager(user(20L, User.Role.GERENTE));

        assertTrue(access.canAccessUser(gerente, gerente));
        assertTrue(access.canAccessUser(gerente, clienteAtribuido));
        assertFalse(access.canAccessUser(gerente, clienteDeOutroGerente));
    }

    @Test
    void administradorAcessaRecursosDeQualquerProprietario() {
        User admin = user(1L, User.Role.ADMINISTRADOR);
        User cliente = user(100L, User.Role.CLIENTE);

        assertTrue(access.canAccessUser(admin, cliente));
    }

    @Test
    void somenteGerenteOuAdministradorPodeAlterarRecursos() {
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> access.requireManagerOrAdministrator(user(1L, User.Role.CLIENTE)));
        assertDoesNotThrow(() -> access.requireManagerOrAdministrator(user(2L, User.Role.GERENTE)));
        assertDoesNotThrow(() -> access.requireManagerOrAdministrator(user(3L, User.Role.ADMINISTRADOR)));
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
