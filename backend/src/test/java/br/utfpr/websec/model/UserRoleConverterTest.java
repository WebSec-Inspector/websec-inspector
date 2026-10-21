package br.utfpr.websec.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class UserRoleConverterTest {

    private final UserRoleConverter converter = new UserRoleConverter();

    @Test
    void lePerfisHistoricosEGravaNomesAtuais() {
        assertEquals(User.Role.CLIENTE, converter.convertToEntityAttribute("USER"));
        assertEquals(User.Role.ADMINISTRADOR, converter.convertToEntityAttribute("ADMIN"));
        assertEquals("CLIENTE", converter.convertToDatabaseColumn(User.Role.CLIENTE));
        assertEquals("GERENTE", converter.convertToDatabaseColumn(User.Role.GERENTE));
        assertEquals("ADMINISTRADOR", converter.convertToDatabaseColumn(User.Role.ADMINISTRADOR));
    }
}
