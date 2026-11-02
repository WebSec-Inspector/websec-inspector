package br.utfpr.websec.dto;

import java.time.Instant;
import java.util.List;

public record ScanComparisonResponse(
    Long domainId, String hostname, Snapshot baseline, Snapshot compared,
    boolean complete, List<String> limitations,
    int unidentifiedBaseline, int unidentifiedCompared, int duplicateBaseline, int duplicateCompared,
    List<Change> added, List<Change> removed, List<Change> persistent,
    List<Change> unmatchedBaseline, List<Change> unmatchedCompared
) {
    public record Snapshot(Long id, Instant createdAt, Instant finishedAt) {}
    public record Change(String ruleId, String url, String parameter, String method, String title,
                         String baselineSeverity, String comparedSeverity,
                         int baselineOccurrences, int comparedOccurrences, boolean severityChanged) {}
}
