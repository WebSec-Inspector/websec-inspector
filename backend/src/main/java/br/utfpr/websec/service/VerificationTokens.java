package br.utfpr.websec.service;
import java.security.SecureRandom;
import java.util.Base64;

final class VerificationTokens {
    private static final SecureRandom RANDOM=new SecureRandom();
    private VerificationTokens(){}
    static String generate(){
        byte[] bytes=new byte[24];RANDOM.nextBytes(bytes);
        return "websec-verify-"+Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
