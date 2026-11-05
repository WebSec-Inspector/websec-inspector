package br.utfpr.websec.dto;

import br.utfpr.websec.model.User;

public record CurrentUserResponse(Long id, String name, String email, User.Role role) {}
