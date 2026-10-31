package br.utfpr.websec.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DomainHostnameTest {
    @Test
    void aceitaHostnameEUrlHttpOuHttps() {
        assertEquals("example.com", DomainHostname.fromInput("example.com"));
        assertEquals("example.com", DomainHostname.fromInput("https://www.example.com/path?q=1"));
        assertEquals("localhost", DomainHostname.fromInput("http://localhost:8080/health"));
    }

    @Test
    void rejeitaProtocolosArbitrariosCredenciaisEHostnamesInvalidos() {
        assertThrows(IllegalArgumentException.class, () -> DomainHostname.fromInput("javascript:alert(1)"));
        assertThrows(IllegalArgumentException.class, () -> DomainHostname.fromInput("ftp://example.com"));
        assertThrows(IllegalArgumentException.class, () -> DomainHostname.fromInput("https://user:pass@example.com"));
        assertThrows(IllegalArgumentException.class, () -> DomainHostname.fromInput("bad..example.com"));
    }

    @Test
    void canonicalizacaoContinuaIdempotenteECompativelComWwwLegado() {
        assertEquals("example.com", DomainHostname.normalize("WWW.EXAMPLE.COM."));
        assertEquals("www.www.example.com", DomainHostname.normalize("WWW.WWW.EXAMPLE.COM."));
        assertEquals("www.www.example.com", DomainHostname.normalize(DomainHostname.normalize("www.www.example.com")));
    }
}
