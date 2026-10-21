package br.utfpr.websec.model;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Persiste os nomes atuais dos perfis e lê os valores históricos do banco.
 * USER/ADMIN são aceitos somente para manter compatibilidade com contas já existentes.
 */
@Converter
public class UserRoleConverter implements AttributeConverter<User.Role, String> {

    @Override
    public String convertToDatabaseColumn(User.Role role) {
        return role == null ? null : role.name();
    }

    @Override
    public User.Role convertToEntityAttribute(String value) {
        if (value == null || value.isBlank()) {
            return User.Role.CLIENTE;
        }
        return switch (value.trim().toUpperCase()) {
            case "USER", "CLIENTE" -> User.Role.CLIENTE;
            case "ADMIN", "ADMINISTRADOR" -> User.Role.ADMINISTRADOR;
            case "GERENTE" -> User.Role.GERENTE;
            default -> throw new IllegalArgumentException("Perfil de usuário desconhecido no banco: " + value);
        };
    }
}
