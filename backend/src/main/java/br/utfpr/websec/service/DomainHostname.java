package br.utfpr.websec.service;

import java.net.IDN;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Shared hostname validation for explicit domain registration and scans. */
public final class DomainHostname {
    private static final Pattern SCHEME = Pattern.compile("^[a-z][a-z0-9+.-]*:.*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LABEL = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");

    private DomainHostname() {}

    public static String fromInput(String input) {
        if (input == null || input.isBlank()) throw new IllegalArgumentException("Informe um hostname ou URL HTTP/HTTPS.");
        String value = input.trim();
        if (value.chars().anyMatch(Character::isWhitespace)) throw new IllegalArgumentException("Hostname ou URL inválida.");
        boolean explicitHttp = value.matches("(?i)^https?://.*");
        boolean hostnameWithPort = value.matches("(?i)^(?:[a-z0-9-]+\\.)*[a-z0-9-]+:\\d+(?:[/?#].*)?$");
        if (SCHEME.matcher(value).matches() && !explicitHttp && !hostnameWithPort)
            throw new IllegalArgumentException("Somente URLs HTTP ou HTTPS são aceitas.");
        URI uri;
        try { uri = URI.create(explicitHttp ? value : "https://" + value); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("Hostname ou URL inválida."); }
        if (uri.getUserInfo() != null || uri.getHost() == null || uri.getHost().isBlank())
            throw new IllegalArgumentException("Informe um hostname válido, sem credenciais na URL.");
        if (uri.getPort() == 0 || uri.getPort() < -1 || uri.getPort() > 65535)
            throw new IllegalArgumentException("Porta inválida na URL.");
        return normalize(uri.getHost());
    }

    public static String normalize(String hostname) {
        if (hostname == null || hostname.isBlank()) throw new IllegalArgumentException("Hostname inválido.");
        String result = hostname.trim().toLowerCase(Locale.ROOT);
        while (result.endsWith(".")) result = result.substring(0, result.length() - 1);
        if (result.startsWith("www.") && !result.startsWith("www.www.")) result = result.substring(4);
        try { result = IDN.toASCII(result, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("Hostname inválido."); }
        if (result.isBlank() || result.length() > 253) throw new IllegalArgumentException("Hostname inválido.");
        for (String label : result.split("\\.", -1)) {
            if (label.length() > 63 || !LABEL.matcher(label).matches()) throw new IllegalArgumentException("Hostname inválido.");
        }
        return result;
    }

    public static void ensureExists(String hostname) {
        try { InetAddress.getAllByName(hostname); }
        catch (UnknownHostException ex) {
            try { InetAddress.getAllByName("www." + hostname); }
            catch (UnknownHostException ignored) {
                throw new IllegalArgumentException("O domínio \"" + hostname + "\" não foi encontrado. Verifique se a URL está correta.");
            }
        }
    }
}
