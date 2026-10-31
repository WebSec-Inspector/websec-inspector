package br.utfpr.websec.exception;
import br.utfpr.websec.model.Domain;

public class ExistingDomainTokenException extends RuntimeException {
    private final Long domainId;
    private final String hostname;
    private final String existingToken;
    public ExistingDomainTokenException(Domain domain) {
        super("Este domínio já tem um token estável. Escolha reutilizar a prova existente.");
        domainId=domain.getId();hostname=domain.getHostname();existingToken=domain.getVerificationToken();
    }
    public Long getDomainId(){return domainId;}
    public String getHostname(){return hostname;}
    public String getExistingToken(){return existingToken;}
}
