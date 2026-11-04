package br.utfpr.websec.service;

import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Separate proxied bean: account and initial refresh family commit together. */
@Service
public class RegistrationTransactionService {
    private final UserRepository users;
    private final RefreshSessionService sessions;
    public RegistrationTransactionService(UserRepository users, RefreshSessionService sessions) {
        this.users=users;this.sessions=sessions;
    }
    @Transactional
    public RefreshSessionService.Session create(User user) {
        users.saveAndFlush(user);
        return sessions.start(user);
    }
}
