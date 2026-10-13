package br.utfpr.websec.service;

import br.utfpr.websec.model.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/** Bypass restrito a administradores em ambiente dev e desabilitado por padrão. */
@Service
public class DevelopmentBypassService {

    private final boolean configuredEnabled;
    private final Environment environment;
    private final AccessControlService accessControlService;

    public DevelopmentBypassService(
            @Value("${websec.security.dev-bypass-enabled:false}") boolean configuredEnabled,
            Environment environment,
            AccessControlService accessControlService) {
        this.configuredEnabled = configuredEnabled;
        this.environment = environment;
        this.accessControlService = accessControlService;
    }

    public boolean isEnabled() {
        return configuredEnabled
                && environment.acceptsProfiles(Profiles.of("dev"))
                && !environment.acceptsProfiles(Profiles.of("prod"));
    }

    public void requireEnabledFor(User actor) {
        accessControlService.requireAdministrator(actor);
        if (!isEnabled()) {
            throw new IllegalStateException(
                    "O bypass de desenvolvimento está desabilitado. Ative WEBSEC_DEV_BYPASS_ENABLED=true com o perfil dev.");
        }
    }
}
