package br.utfpr.websec.service;

import java.net.URI;
import java.util.Locale;

/**
 * Alvo de um scan: a URL normalizada que o worker executa e o hostname
 * canônico usado nas regras de domínio e de verificação de propriedade.
 */
public record ScanTarget(String targetUrl, String hostname) {
    public static final int MAX_URL_LENGTH = 2048;

    public static ScanTarget fromInput(String input) {
        if (input != null && input.length() > MAX_URL_LENGTH)
            throw new IllegalArgumentException("A URL deve ter no máximo " + MAX_URL_LENGTH + " caracteres.");
        // Reaproveita as regras do cadastro de domínio: só HTTP/HTTPS, sem credenciais, porta 1-65535.
        String hostname = DomainHostname.fromInput(input);
        String value = input.trim();
        URI uri = URI.create(value.matches("(?i)^https?://.*") ? value : "https://" + value);
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        boolean defaultPort = port == -1 || ("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80);
        StringBuilder url = new StringBuilder(scheme).append("://").append(host);
        if (!defaultPort) url.append(':').append(port);
        // Caminho e query são mantidos como enviados (codificação e maiúsculas inclusas);
        // o fragmento é descartado porque o navegador nunca o envia ao servidor.
        if (uri.getRawPath() != null) url.append(uri.getRawPath());
        if (uri.getRawQuery() != null) url.append('?').append(uri.getRawQuery());
        if (url.length() > MAX_URL_LENGTH)
            throw new IllegalArgumentException("A URL deve ter no máximo " + MAX_URL_LENGTH + " caracteres.");
        return new ScanTarget(url.toString(), hostname);
    }
}
