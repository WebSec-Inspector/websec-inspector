package br.utfpr.websec.service;

import org.springframework.stereotype.Service;
import us.springett.cvss.Cvss;
import us.springett.cvss.CvssV4;
import java.util.*;

/** Strict CVSS-B input; no risk-to-metrics inference and no silent defaults. */
@Service
public class Cvss4Calculator {
    public record Calculation(String version,String nomenclature,String vector,double score,String severity) {}
    private static final List<String> ORDER=List.of("AV","AC","AT","PR","UI","VC","VI","VA","SC","SI","SA");
    private static final Map<String,Set<String>> VALUES=Map.ofEntries(
        Map.entry("AV",Set.of("N","A","L","P")),Map.entry("AC",Set.of("L","H")),Map.entry("AT",Set.of("N","P")),
        Map.entry("PR",Set.of("N","L","H")),Map.entry("UI",Set.of("N","P","A")),
        Map.entry("VC",Set.of("H","L","N")),Map.entry("VI",Set.of("H","L","N")),Map.entry("VA",Set.of("H","L","N")),
        Map.entry("SC",Set.of("H","L","N")),Map.entry("SI",Set.of("H","L","N")),Map.entry("SA",Set.of("H","L","N")));

    public Calculation calculate(String vector) {
        if(vector==null || vector.length()>255)throw invalid();
        String[] segments=vector.split("/",-1);
        if(segments.length!=12 || !segments[0].equals("CVSS:4.0"))throw invalid();
        Map<String,String> metrics=new HashMap<>();
        for(int i=1;i<segments.length;i++) {
            String[] pair=segments[i].split(":",-1);
            if(pair.length!=2 || !VALUES.containsKey(pair[0]) || !VALUES.get(pair[0]).contains(pair[1])
                || metrics.putIfAbsent(pair[0],pair[1])!=null)throw invalid();
        }
        if(metrics.size()!=ORDER.size())throw invalid();
        String canonical="CVSS:4.0/"+String.join("/",ORDER.stream().map(k->k+":"+metrics.get(k)).toList());
        Cvss cvss=Cvss.fromVector(canonical);
        if(!(cvss instanceof CvssV4))throw invalid();
        double score=cvss.calculateScore().getBaseScore();
        if(!Double.isFinite(score) || score<0 || score>10)throw new IllegalStateException("Não foi possível calcular o CVSS.");
        String severity=score==0?"NONE":score<4?"LOW":score<7?"MEDIUM":score<9?"HIGH":"CRITICAL";
        return new Calculation("4.0","CVSS-B",canonical,score,severity);
    }

    private static IllegalArgumentException invalid(){
        return new IllegalArgumentException("Informe as 11 métricas Base válidas do CVSS 4.0, sem duplicatas ou métricas adicionais.");
    }
}
