package br.utfpr.websec.dto;
import br.utfpr.websec.model.Scan;
import java.time.Instant;

/** Scalar query result: does not reuse a stale managed entity after a bulk transition. */
public record ScanState(Scan.Status status,Instant finishedAt,Instant deletedAt) {}
