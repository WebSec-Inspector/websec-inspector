package br.utfpr.websec.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Mesma validação aplicada pela API antes de o ScanService receber a URL. */
class ScanRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private boolean valid(String url) {
        return validator.validate(new ScanRequest(url, null, null)).isEmpty();
    }

    @Test
    void aceitaEsquemaComMaiusculas() {
        assertTrue(valid("HTTPS://WWW.Exemplo.COM/x"));
        assertTrue(valid("Http://exemplo.com:8080"));
        assertTrue(valid("exemplo.com/painel"));
    }

    @Test
    void rejeitaOutrosEsquemasEUrlLonga() {
        assertFalse(valid("ftp://exemplo.com"));
        assertFalse(valid("https://exemplo.com/" + "a".repeat(2048)));
    }
}
