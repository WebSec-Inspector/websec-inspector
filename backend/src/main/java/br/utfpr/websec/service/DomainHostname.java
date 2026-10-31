package br.utfpr.websec.service;

import java.net.IDN;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Regras únicas para extrair, normalizar e validar hostname no cadastro e nos scans. */
public final class DomainHostname {
    private static final Pattern SCHEME = Pattern.compile("^[a-z][a-z0-9+.-]*:.*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LABEL = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");

    private DomainHostname() {}

    public static String fromInput(String input) {
        if (input == null || input.isBlank()) {
            throw new IllegalArgumentException("Informe um hostname ou URL HTTP/HTTPS.");
        }
        String value = input.trim();
        if (value.chars().anyMatch(Character::isWhitespace)) {
            throw new IllegalArgumentException("Hostname ou URL inválida.");
        }

        URI uri;
        try {
            boolean explicitHttp = value.matches("(?i)^https?://.*");
            boolean hostnameWithPort = value.matches("(?i)^(?:[a-z0-9-]+\\.)*[a-z0-9-]+:\\d+(?:[/?#].*)?$");
            if (SCHEME.matcher(value).matches() && !explicitHttp && !hostnameWithPort) {
                throw new IllegalArgumentException("Somente URLs HTTP ou HTTPS são aceitas.");
            }
            uri = URI.create(value.matches("(?i)^https?://.*") ? value : "https://" + value);
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("Somente URLs")) throw ex;
            throw new IllegalArgumentException("Hostname ou URL inválida.");
        }

        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Somente URLs HTTP ou HTTPS são aceitas.");
        }
        if (uri.getUserInfo() != null || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("Informe um hostname válido, sem credenciais na URL.");
        }
        if (uri.getPort() == 0 || uri.getPort() < -1 || uri.getPort() > 65535) {
            throw new IllegalArgumentException("Porta inválida na URL.");
        }
        return normalize(uri.getHost());
    }

    /** Mantém a regra histórica de canonicalização do produto (remove um único www.). */
    public static String normalize(String hostname) {
        if (hostname == null || hostname.isBlank()) throw new IllegalArgumentException("Hostname inválido.");
        String result = hostname.trim().toLowerCase(Locale.ROOT);
        while (result.endsWith(".")) result = result.substring(0, result.length() - 1);
        if (result.startsWith("www.") && !result.startsWith("www.www.")) result = result.substring(4);

        try {
            result = IDN.toASCII(result, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Hostname inválido.");
        }
        if (result.isBlank() || result.length() > 253) throw new IllegalArgumentException("Hostname inválido.");
        String[] labels = result.split("\\.", -1);
        for (String label : labels) {
            if (label.length() > 63 || !LABEL.matcher(label).matches()) {
                throw new IllegalArgumentException("Hostname inválido.");
            }
        }
        return result;
    }

    public static void ensureExists(String hostname) {
        try {
            InetAddress.getAllByName(hostname);
        } catch (UnknownHostException ex) {
            // Mantém a compatibilidade histórica com sites que publicam apenas www.
            try {
                InetAddress.getAllByName("www." + hostname);
            } catch (UnknownHostException ignored) {
                throw new IllegalArgumentException(
                        "O domínio \"" + hostname + "\" não foi encontrado. Verifique se a URL está correta.");
            }
        }
    }
}
