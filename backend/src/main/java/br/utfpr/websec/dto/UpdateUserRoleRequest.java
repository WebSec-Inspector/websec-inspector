package br.utfpr.websec.dto;

import br.utfpr.websec.model.User;
import jakarta.validation.constraints.NotNull;

public record UpdateUserRoleRequest(@NotNull User.Role role) {}
