package br.utfpr.websec.exception;
import br.utfpr.websec.model.Scan;

public class ScanStateChangedException extends RuntimeException {
    private final String status;
    public ScanStateChangedException(Scan.Status status){
        super("A verificação não foi cancelada: a execução já saiu da etapa de comprovação.");
        this.status=status.name();
    }
    public String getStatus(){return status;}
}
