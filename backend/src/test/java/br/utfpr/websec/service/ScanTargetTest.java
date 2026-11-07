package br.utfpr.websec.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ScanTargetTest {
    private static void assertTarget(String input, String targetUrl, String hostname) {
        ScanTarget target = ScanTarget.fromInput(input);
        assertEquals(targetUrl, target.targetUrl(), input);
        assertEquals(hostname, target.hostname(), input);
    }

    @Test
    void semEsquemaAssumeHttps() {
        assertTarget("exemplo.com", "https://exemplo.com", "exemplo.com");
        assertTarget("exemplo.com/painel", "https://exemplo.com/painel", "exemplo.com");
    }

    @Test
    void preservaCaminhoEQuery() {
        assertTarget("https://exemplo.com/loja/login", "https://exemplo.com/loja/login", "exemplo.com");
        assertTarget("https://exemplo.com/busca?q=a%20b&p=2", "https://exemplo.com/busca?q=a%20b&p=2", "exemplo.com");
        assertTarget("https://exemplo.com/", "https://exemplo.com/", "exemplo.com");
    }

    @Test
    void preservaPortaNaoPadraoERemovePortaPadrao() {
        assertTarget("http://exemplo.com:8080/app", "http://exemplo.com:8080/app", "exemplo.com");
        assertTarget("exemplo.com:8443/app", "https://exemplo.com:8443/app", "exemplo.com");
        assertTarget("http://juice-shop:3000", "http://juice-shop:3000", "juice-shop");
        assertTarget("https://exemplo.com:443/", "https://exemplo.com/", "exemplo.com");
        assertTarget("http://exemplo.com:80/a", "http://exemplo.com/a", "exemplo.com");
        assertTarget("http://exemplo.com:443/a", "http://exemplo.com:443/a", "exemplo.com");
    }

    @Test
    void normalizaEsquemaEHostMasMantemMaiusculasDoCaminho() {
        assertTarget("HTTPS://WWW.Exemplo.COM/Caminho?Q=1", "https://www.exemplo.com/Caminho?Q=1", "exemplo.com");
    }

    @Test
    void descartaFragmento() {
        assertTarget("https://exemplo.com/a#secao", "https://exemplo.com/a", "exemplo.com");
        assertTarget("https://exemplo.com/a?x=1#secao", "https://exemplo.com/a?x=1", "exemplo.com");
    }

    @Test
    void rejeitaEntradasInvalidas() {
        assertThrows(IllegalArgumentException.class, () -> ScanTarget.fromInput("ftp://exemplo.com"));
        assertThrows(IllegalArgumentException.class, () -> ScanTarget.fromInput("https://u:p@exemplo.com"));
        assertThrows(IllegalArgumentException.class, () -> ScanTarget.fromInput("https://exemplo.com:99999"));
        assertThrows(IllegalArgumentException.class, () -> ScanTarget.fromInput("https://exemplo.com:0"));
        assertThrows(IllegalArgumentException.class, () -> ScanTarget.fromInput("https://exemplo.com/" + "a".repeat(2048)));
        assertThrows(IllegalArgumentException.class, () -> ScanTarget.fromInput("   "));
    }
}
