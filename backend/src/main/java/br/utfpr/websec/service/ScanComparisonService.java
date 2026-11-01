package br.utfpr.websec.service;

import br.utfpr.websec.dto.ScanComparisonResponse;
import br.utfpr.websec.dto.ScanComparisonResponse.Change;
import br.utfpr.websec.dto.ScanComparisonResponse.Snapshot;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.*;
import br.utfpr.websec.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;
import java.util.*;

@Service
public class ScanComparisonService {
    private final ScanRepository scans;
    private final UserRepository users;
    private final FindingRepository findings;
    private final AccessControlService access;

    public ScanComparisonService(ScanRepository scans, UserRepository users, FindingRepository findings, AccessControlService access) {
        this.scans=scans;this.users=users;this.findings=findings;this.access=access;
    }

    private Scan authorize(Long id,User actor) {
        Scan scan=scans.findById(id).orElseThrow(()->new ResourceNotFoundException("Varredura não encontrada"));
        if(scan.isDeleted())throw new ResourceNotFoundException("Varredura não encontrada");
        access.requireResourceScope(actor,scan.getDomain().getUser());
        return scan;
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ScanComparisonResponse compare(String email,Long baselineId,Long comparedId) {
        User actor=users.findByEmail(email).orElseThrow(()->new ResourceNotFoundException("Usuário não encontrado"));
        Scan baseline=authorize(baselineId,actor),compared=authorize(comparedId,actor);
        if(baselineId.equals(comparedId))throw new IllegalStateException("Selecione duas varreduras diferentes.");
        if(!baseline.getDomain().getId().equals(compared.getDomain().getId()))
            throw new IllegalStateException("Selecione varreduras do mesmo domínio.");
        if(baseline.getStatus()!=Scan.Status.COMPLETED || compared.getStatus()!=Scan.Status.COMPLETED)
            throw new IllegalStateException("A comparação exige duas varreduras concluídas.");
        Index before=index(findings.findByScanId(baselineId)),after=index(findings.findByScanId(comparedId));
        List<String> limitations=new ArrayList<>();
        if(before.unidentified>0 || after.unidentified>0)
            limitations.add("Há achados sem regra, método ou URL confiáveis. Não é possível afirmar quais surgiram ou deixaram de ser detectados.");
        Set<String> generic=new HashSet<>(),variants=new HashSet<>();
        for(Index side:List.of(before,after))for(Key key:side.groups.keySet()) {
            String[] parts=key.ruleId.split("-",2);
            if(parts.length==1)generic.add(parts[0]);else variants.add(parts[0]);
        }
        if(!Collections.disjoint(generic,variants))
            limitations.add("Há referências genéricas e variantes da mesma regra; a precisão de identidade pode diferir entre execuções.");
        boolean complete=limitations.isEmpty();
        List<Change> added=new ArrayList<>(),removed=new ArrayList<>(),persistent=new ArrayList<>();
        SortedSet<Key> keys=new TreeSet<>(KEY_ORDER);keys.addAll(before.groups.keySet());keys.addAll(after.groups.keySet());
        for(Key key:keys) {
            Group old=before.groups.get(key),current=after.groups.get(key);
            Change change=change(key,old,current);
            if(old!=null && current!=null)persistent.add(change);
            else if(old==null)added.add(change);else removed.add(change);
        }
        return new ScanComparisonResponse(baseline.getDomain().getId(),baseline.getDomain().getHostname(),
            snapshot(baseline),snapshot(compared),complete,List.copyOf(limitations),before.unidentified,after.unidentified,
            before.duplicates,after.duplicates,complete?List.copyOf(added):List.of(),complete?List.copyOf(removed):List.of(),
            List.copyOf(persistent),complete?List.of():List.copyOf(removed),complete?List.of():List.copyOf(added));
    }

    private static Snapshot snapshot(Scan scan){return new Snapshot(scan.getId(),scan.getCreatedAt(),scan.getFinishedAt());}
    private record Key(String ruleId,String url,String parameter,String method) {}
    private static final Comparator<Key> KEY_ORDER=Comparator.comparing(Key::ruleId).thenComparing(Key::url)
        .thenComparing(Key::parameter).thenComparing(Key::method);
    private static class Group {
        Finding representative;
        int count;
        Group(Finding finding){representative=finding;count=1;}
        void add(Finding finding){
            count++;
            int comparison=Integer.compare(rank(finding.getSeverity()),rank(representative.getSeverity()));
            if(comparison>0 || (comparison==0 && finding.getId()<representative.getId()))representative=finding;
        }
    }
    private record Index(Map<Key,Group> groups,int unidentified,int duplicates) {}

    private static int rank(Finding.Severity severity) {
        return switch(severity){case INFORMATIONAL->0;case LOW->1;case MEDIUM->2;case HIGH->3;case CRITICAL->4;};
    }

    private static Index index(List<Finding> findings) {
        Map<Key,Group> groups=new TreeMap<>(KEY_ORDER);int unidentified=0,duplicates=0;
        for(Finding finding:findings) {
            String rule=finding.getZapRuleId(),method=finding.getHttpMethod(),url=canonicalUrl(finding.getAffectedUrl());
            if(rule==null || !rule.matches("[0-9]{1,10}(-[0-9]{1,10})?") || method==null
                    || !method.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,255}") || url==null){unidentified++;continue;}
            String normalizedRule=String.join("-",Arrays.stream(rule.split("-")).map(p->Long.toString(Long.parseLong(p))).toList());
            Key key=new Key(normalizedRule,url,Objects.requireNonNullElse(finding.getAffectedParameter(),""),method);
            Group group=groups.get(key);
            if(group==null)groups.put(key,new Group(finding));else{group.add(finding);duplicates++;}
        }
        return new Index(groups,unidentified,duplicates);
    }

    static String canonicalUrl(String value) {
        if(value==null)return null;
        try {
            URI uri=URI.create(value);
            String scheme=uri.getScheme(),host=uri.getHost();
            if(scheme==null || host==null || uri.getRawUserInfo()!=null)return null;
            scheme=scheme.toLowerCase(Locale.ROOT);host=host.toLowerCase(Locale.ROOT);
            if(!scheme.equals("http") && !scheme.equals("https"))return null;
            int port=uri.getPort();
            if(port>65535)return null;
            boolean defaultPort=port==-1 || (scheme.equals("https") && port==443) || (scheme.equals("http") && port==80);
            String path=uri.getRawPath();
            if(path==null || path.isEmpty())path="/";
            return scheme+"://"+host+(defaultPort?"":":"+port)+path+(uri.getRawQuery()==null?"":"?"+uri.getRawQuery());
        } catch(IllegalArgumentException ex){return null;}
    }

    private static Change change(Key key,Group old,Group current) {
        Finding display=current==null?old.representative:current.representative;
        String before=old==null?null:old.representative.getSeverity().name();
        String after=current==null?null:current.representative.getSeverity().name();
        return new Change(key.ruleId,key.url,key.parameter,key.method,
            Objects.requireNonNullElse(display.getTitle(),display.getOwaspCategory()),before,after,
            old==null?0:old.count,current==null?0:current.count,before!=null && after!=null && !before.equals(after));
    }
}
