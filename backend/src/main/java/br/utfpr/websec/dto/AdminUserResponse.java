package br.utfpr.websec.dto;

import br.utfpr.websec.model.User;

public record AdminUserResponse(
        Long id,
        String name,
        String email,
        User.Role role,
        Long managerId
) {}
