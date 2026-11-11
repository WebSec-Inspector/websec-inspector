package br.utfpr.websec.service;

import br.utfpr.websec.dto.AdminDashboardResponse;
import br.utfpr.websec.dto.AdminDashboardResponse.PeriodMetric;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.Finding;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.FindingRepository;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AdminDashboardService {

    private final UserRepository userRepository;
    private final ScanRepository scanRepository;
    private final FindingRepository findingRepository;
    private final AccessControlService accessControlService;

    public AdminDashboardService(
            UserRepository userRepository,
            ScanRepository scanRepository,
            FindingRepository findingRepository,
            AccessControlService accessControlService) {
        this.userRepository = userRepository;
        this.scanRepository = scanRepository;
        this.findingRepository = findingRepository;
        this.accessControlService = accessControlService;
    }

    @Transactional(readOnly = true)
    public AdminDashboardResponse getMetrics(String actorEmail, int days) {
        User actor = userRepository.findByEmail(actorEmail)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario autenticado nao encontrado"));
        accessControlService.requireAdministrator(actor);

        int safeDays = Math.max(1, Math.min(days, 90));
        long totalUsers = userRepository.count();

        List<Scan> activeScans = scanRepository.findAll().stream()
                .filter(s -> !s.isDeleted())
                .toList();

        long totalScans = activeScans.size();

        Map<String, Long> scansByStatus = new LinkedHashMap<>();
        for (Scan.Status status : Scan.Status.values()) {
            scansByStatus.put(status.name(), 0L);
        }
        for (Scan scan : activeScans) {
            scansByStatus.compute(scan.getStatus().name(), (k, v) -> (v == null ? 0L : v) + 1L);
        }

        long processingFailures = scansByStatus.getOrDefault(Scan.Status.FAILED.name(), 0L);

        double averageExecutionSeconds = activeScans.stream()
                .filter(s -> s.getFinishedAt() != null && (s.getStartedAt() != null || s.getCreatedAt() != null))
                .mapToLong(s -> {
                    Instant start = s.getStartedAt() != null ? s.getStartedAt() : s.getCreatedAt();
                    return Math.max(0L, Duration.between(start, s.getFinishedAt()).toSeconds());
                })
                .average()
                .orElse(0.0);

        Map<String, Long> findingsBySeverity = new LinkedHashMap<>();
        for (Finding.Severity severity : Finding.Severity.values()) {
            findingsBySeverity.put(severity.name(), 0L);
        }
        findingRepository.findAll().stream()
                .filter(f -> f.getScan() != null && !f.getScan().isDeleted())
                .forEach(f -> findingsBySeverity.compute(
                        f.getSeverity().name(), (k, v) -> (v == null ? 0L : v) + 1L));

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate startDate = today.minusDays(safeDays - 1L);

        Map<LocalDate, Long> groupedByDay = activeScans.stream()
                .filter(s -> s.getCreatedAt() != null)
                .map(s -> s.getCreatedAt().atZone(ZoneOffset.UTC).toLocalDate())
                .filter(d -> !d.isBefore(startDate) && !d.isAfter(today))
                .collect(Collectors.groupingBy(d -> d, Collectors.counting()));

        List<PeriodMetric> scansByPeriod = new ArrayList<>();
        for (int i = 0; i < safeDays; i++) {
            LocalDate date = startDate.plusDays(i);
            scansByPeriod.add(new PeriodMetric(date.toString(), groupedByDay.getOrDefault(date, 0L)));
        }

        return new AdminDashboardResponse(
                totalUsers,
                totalScans,
                processingFailures,
                Math.round(averageExecutionSeconds * 10.0) / 10.0,
                scansByStatus,
                findingsBySeverity,
                scansByPeriod
        );
    }
}