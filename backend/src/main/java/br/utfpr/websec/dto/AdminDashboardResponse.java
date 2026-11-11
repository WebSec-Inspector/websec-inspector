package br.utfpr.websec.dto;

import java.util.List;
import java.util.Map;

public record AdminDashboardResponse(
    long totalUsers,
    long totalScans,
    long processingFailures,
    double averageExecutionSeconds,
    Map<String, Long> scansByStatus,
    Map<String, Long> findingsBySeverity,
    List<PeriodMetric> scansByPeriod
) {
    public record PeriodMetric(String date, long count) {}
}