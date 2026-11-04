package br.utfpr.websec.service;

import br.utfpr.websec.dto.AuthResponse;
import br.utfpr.websec.dto.CurrentUserResponse;
import br.utfpr.websec.dto.LoginRequest;
import br.utfpr.websec.dto.RegisterRequest;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.exception.EmailAlreadyRegisteredException;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshSessionService sessions;
    private final RegistrationTransactionService registrations;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, RefreshSessionService sessions,
                       RegistrationTransactionService registrations) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.sessions = sessions;
        this.registrations = registrations;
    }

    public RefreshSessionService.Session register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyRegisteredException();
        }
        User user = new User();
        user.setName(request.name());
        user.setEmail(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        // O cadastro público sempre cria CLIENTE; o cliente nunca escolhe seu próprio perfil.
        user.setRole(User.Role.CLIENTE);
        try {
            return registrations.create(user);
        } catch (DataIntegrityViolationException ex) {
            // The repository transaction has rolled back. A competing registration
            // may have inserted this email after the initial existence check.
            if (userRepository.existsByEmail(request.email())) {
                throw new EmailAlreadyRegisteredException();
            }
            throw ex;
        }
    }

    public RefreshSessionService.Session login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new BadCredentialsException("Credenciais inválidas"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Credenciais inválidas");
        }
        return sessions.start(user);
    }

    @Transactional(readOnly = true)
    public CurrentUserResponse currentUser(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário autenticado não encontrado"));
        return new CurrentUserResponse(user.getId(), user.getName(), user.getEmail(), user.getRole());
    }
}
