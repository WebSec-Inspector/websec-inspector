package br.utfpr.websec.service;

import br.utfpr.websec.model.User;
import org.junit.jupiter.api.Test;
//import org.springframework.core.env.MockEnvironment;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.*;

class DevelopmentBypassServiceTest {

    private final AccessControlService accessControl = new AccessControlService();

    @Test
    void bypassSoFuncionaParaAdministradorComFlagEPerfilDev() {
        MockEnvironment environment = new MockEnvironment().withProperty("spring.profiles.active", "dev");
        environment.setActiveProfiles("dev");
        DevelopmentBypassService service = new DevelopmentBypassService(true, environment, accessControl);

        assertTrue(service.isEnabled());
        assertDoesNotThrow(() -> service.requireEnabledFor(user(User.Role.ADMINISTRADOR)));
        assertThrows(AccessDeniedException.class, () -> service.requireEnabledFor(user(User.Role.CLIENTE)));
        assertThrows(AccessDeniedException.class, () -> service.requireEnabledFor(user(User.Role.GERENTE)));
    }

    @Test
    void bypassDesabilitadoPorPadraoOuForaDoPerfilDev() {
        MockEnvironment noProfile = new MockEnvironment();
        DevelopmentBypassService disabled = new DevelopmentBypassService(false, noProfile, accessControl);
        assertFalse(disabled.isEnabled());
        assertThrows(IllegalStateException.class,
                () -> disabled.requireEnabledFor(user(User.Role.ADMINISTRADOR)));

        MockEnvironment production = new MockEnvironment();
        production.setActiveProfiles("prod");
        DevelopmentBypassService prodService = new DevelopmentBypassService(true, production, accessControl);
        assertFalse(prodService.isEnabled());
    }

    private static User user(User.Role role) {
        User user = new User();
        user.setRole(role);
        user.setEmail("test@example.test");
        return user;
    }
}
