<!-- ============================================================================
ADMIN DASHBOARD - BACKEND IMPLEMENTATION GUIDE
Comprehensive Integration Strategy for Admin Metrics
============================================================================= -->

## 1. Data Transfer Objects (DTOs)

### 1.1 Response DTOs

```java
// src/main/java/br/utfpr/websec/dto/AdminDashboardMetricsResponse.java
package br.utfpr.websec.dto;

import java.time.Instant;
import java.util.List;

public class AdminDashboardMetricsResponse {
    private ScanMetrics scanMetrics;
    private FindingMetrics findingMetrics;
    private UserMetrics userMetrics;
    private PerformanceMetrics performanceMetrics;
    private Instant lastUpdated;

    // Constructor and getters/setters
}

// Scan-related metrics
public class ScanMetrics {
    private Long totalScans;
    private Long completedScans;
    private Long failedScans;
    private Long pendingScans;
    private List<ScanByStatusResponse> byStatus;
    private List<ScanByPeriodResponse> byPeriod; // daily, weekly, monthly
}

public class ScanByStatusResponse {
    private String status;
    private Long count;
    private Double percentage;
}

public class ScanByPeriodResponse {
    private String period; // format: "2026-01-15" for daily, "2026-W03" for weekly, "2026-01" for monthly
    private Long totalScans;
    private Long completedScans;
    private Long failedScans;
    private Long runningScans;
}

// Finding-related metrics
public class FindingMetrics {
    private Long totalFindings;
    private SeverityDistribution severityDistribution;
    private List<FindingsBySeverityResponse> bySeverity;
    private List<FindingsByOWASPResponse> byOWASP;
}

public class SeverityDistribution {
    private Long criticalCount;
    private Long highCount;
    private Long mediumCount;
    private Long lowCount;
    private Double criticalPercentage;
    private Double highPercentage;
    private Double mediumPercentage;
    private Double lowPercentage;
}

public class FindingsBySeverityResponse {
    private Finding.Severity severity;
    private Long count;
    private Double percentage;
    private Double avgCVSSScore;
    private Double maxCVSSScore;
}

public class FindingsByOWASPResponse {
    private String owaspCategory;
    private String severity;
    private Long count;
    private Double avgCVSSScore;
}

// User-related metrics
public class UserMetrics {
    private Long totalUsers;
    private Long adminCount;
    private Long regularUserCount;
    private Long newUsersLast30Days;
    private List<UsersByPeriodResponse> byPeriod;
}

public class UsersByPeriodResponse {
    private String period; // format: "2026-01"
    private Long newUsers;
}

// Performance metrics
public class PerformanceMetrics {
    private Long completedScans;
    private Double avgExecutionMinutes;
    private Double minExecutionMinutes;
    private Double maxExecutionMinutes;
    private Double stdDevExecutionMinutes;
    private List<ProcessingFailureResponse> recentFailures;
    private List<ExecutionTimeByPeriodResponse> executionTimeByPeriod;
}

public class ProcessingFailureResponse {
    private Long scanId;
    private String domainUrl;
    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;
    private Long durationMinutes;
    private Long findingsCount;
}

public class ExecutionTimeByPeriodResponse {
    private String period; // format: "2026-01-15 10:00:00"
    private Long completedScans;
    private Double avgExecutionMinutes;
}
```

## 2. Custom Repository Queries

### 2.1 Scan Repository

```java
// src/main/java/br/utfpr/websec/repository/ScanRepository.java
package br.utfpr.websec.repository;

import br.utfpr.websec.model.Scan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface ScanRepository extends JpaRepository<Scan, Long> {
    
    // Scan by status count
    @Query("SELECT NEW map(s.status as status, COUNT(s) as count) " +
           "FROM Scan s " +
           "GROUP BY s.status")
    List<Map<String, Object>> countByStatus();
    
    // Scans by day (last 30 days)
    @Query(value = "SELECT DATE(s.created_at) as period_date, " +
                   "COUNT(*) as total_scans, " +
                   "SUM(CASE WHEN s.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_scans, " +
                   "SUM(CASE WHEN s.status = 'FAILED' THEN 1 ELSE 0 END) as failed_scans " +
                   "FROM scans s " +
                   "WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) " +
                   "GROUP BY DATE(s.created_at) " +
                   "ORDER BY period_date DESC", 
           nativeQuery = true)
    List<Map<String, Object>> findDailyScanMetrics();
    
    // Count scans by status
    long countByStatus(Scan.Status status);
    
    // Find potentially stuck scans
    @Query("SELECT s FROM Scan s " +
           "WHERE s.status IN ('QUEUED', 'RUNNING') " +
           "ORDER BY s.createdAt ASC")
    List<Scan> findStuckScans();
    
    // Find failed scans (recent)
    @Query("SELECT s FROM Scan s " +
           "WHERE s.status = 'FAILED' " +
           "AND s.finishedAt >= :since " +
           "ORDER BY s.finishedAt DESC")
    List<Scan> findFailedScans(@Param("since") Instant since);
}
```

### 2.2 Finding Repository

```java
// src/main/java/br/utfpr/websec/repository/FindingRepository.java
package br.utfpr.websec.repository;

import br.utfpr.websec.model.Finding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface FindingRepository extends JpaRepository<Finding, Long> {
    
    // Severity distribution
    @Query("SELECT NEW map(f.severity as severity, COUNT(f) as count, AVG(f.cvssScore) as avgCvssScore) " +
           "FROM Finding f " +
           "GROUP BY f.severity")
    List<Map<String, Object>> findSeverityDistribution();
    
    // Severity distribution (recent completed scans only)
    @Query("SELECT NEW map(f.severity as severity, COUNT(f) as count, AVG(f.cvssScore) as avgCvssScore) " +
           "FROM Finding f " +
           "JOIN f.scan s " +
           "WHERE s.status = 'COMPLETED' " +
           "AND s.finishedAt >= :since " +
           "GROUP BY f.severity")
    List<Map<String, Object>> findSeverityDistributionSince(@Param("since") Instant since);
    
    // Count findings by severity
    long countBySeverity(Finding.Severity severity);
    
    // Findings by OWASP category
    @Query("SELECT NEW map(f.owaspCategory as owaspCategory, f.severity as severity, " +
           "COUNT(f) as count, AVG(f.cvssScore) as avgCvssScore) " +
           "FROM Finding f " +
           "GROUP BY f.owaspCategory, f.severity " +
           "ORDER BY f.owaspCategory, f.severity")
    List<Map<String, Object>> findByOWASPCategory();
}
```

## 3. Admin Service

```java
// src/main/java/br/utfpr/websec/service/AdminDashboardService.java
package br.utfpr.websec.service;

import br.utfpr.websec.dto.*;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.Finding;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.FindingRepository;
import br.utfpr.websec.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminDashboardService {
    
    private final ScanRepository scanRepository;
    private final FindingRepository findingRepository;
    private final UserRepository userRepository;
    
    // Main method to get all dashboard metrics
    public AdminDashboardMetricsResponse getDashboardMetrics() {
        return AdminDashboardMetricsResponse.builder()
            .scanMetrics(getScanMetrics())
            .findingMetrics(getFindingMetrics())
            .userMetrics(getUserMetrics())
            .performanceMetrics(getPerformanceMetrics())
            .lastUpdated(Instant.now())
            .build();
    }
    
    private ScanMetrics getScanMetrics() {
        ScanMetrics metrics = new ScanMetrics();
        
        // Total counts
        metrics.setTotalScans(scanRepository.count());
        metrics.setCompletedScans(scanRepository.countByStatus(Scan.Status.COMPLETED));
        metrics.setFailedScans(scanRepository.countByStatus(Scan.Status.FAILED));
        metrics.setPendingScans(
            scanRepository.count() - metrics.getCompletedScans() - metrics.getFailedScans()
        );
        
        // By status breakdown
        List<ScanByStatusResponse> byStatus = scanRepository.countByStatus()
            .stream()
            .map(map -> new ScanByStatusResponse(
                (String) map.get("status"),
                ((Number) map.get("count")).longValue(),
                calculatePercentage(((Number) map.get("count")).longValue(), metrics.getTotalScans())
            ))
            .collect(Collectors.toList());
        metrics.setByStatus(byStatus);
        
        // By period (daily)
        List<ScanByPeriodResponse> byPeriod = scanRepository.findDailyScanMetrics()
            .stream()
            .map(map -> new ScanByPeriodResponse(
                map.get("period_date").toString(),
                ((Number) map.get("total_scans")).longValue(),
                ((Number) map.get("completed_scans")).longValue(),
                ((Number) map.get("failed_scans")).longValue()
            ))
            .collect(Collectors.toList());
        metrics.setByPeriod(byPeriod);
        
        return metrics;
    }
    
    private FindingMetrics getFindingMetrics() {
        FindingMetrics metrics = new FindingMetrics();
        
        metrics.setTotalFindings(findingRepository.count());
        
        // Severity distribution
        metrics.setCriticalCount(findingRepository.countBySeverity(Finding.Severity.CRITICAL));
        metrics.setHighCount(findingRepository.countBySeverity(Finding.Severity.HIGH));
        metrics.setMediumCount(findingRepository.countBySeverity(Finding.Severity.MEDIUM));
        metrics.setLowCount(findingRepository.countBySeverity(Finding.Severity.LOW));
        
        // By severity breakdown with percentages
        List<FindingsBySeverityResponse> bySeverity = findingRepository.findSeverityDistribution()
            .stream()
            .map(map -> new FindingsBySeverityResponse(
                (Finding.Severity) map.get("severity"),
                ((Number) map.get("count")).longValue(),
                calculatePercentage(((Number) map.get("count")).longValue(), metrics.getTotalFindings()),
                ((Number) map.get("avgCvssScore")).doubleValue()
            ))
            .collect(Collectors.toList());
        metrics.setBySeverity(bySeverity);
        
        return metrics;
    }
    
    private UserMetrics getUserMetrics() {
        UserMetrics metrics = new UserMetrics();
        
        metrics.setTotalUsers(userRepository.count());
        metrics.setAdminCount(userRepository.countByRole(User.Role.ADMIN));
        metrics.setRegularUserCount(metrics.getTotalUsers() - metrics.getAdminCount());
        
        // New users in last 30 days
        Instant thirtyDaysAgo = Instant.now().minus(30, ChronoUnit.DAYS);
        metrics.setNewUsersLast30Days(userRepository.countByCreatedAtAfter(thirtyDaysAgo));
        
        return metrics;
    }
    
    private PerformanceMetrics getPerformanceMetrics() {
        PerformanceMetrics metrics = new PerformanceMetrics();
        
        // Get execution time statistics
        Map<String, Object> executionStats = scanRepository.getExecutionTimeStatistics();
        if (executionStats != null) {
            metrics.setCompletedScans(((Number) executionStats.get("completedScans")).longValue());
            metrics.setAvgExecutionMinutes(((Number) executionStats.get("avgExecutionMinutes")).doubleValue());
            metrics.setMinExecutionMinutes(((Number) executionStats.get("minExecutionMinutes")).doubleValue());
            metrics.setMaxExecutionMinutes(((Number) executionStats.get("maxExecutionMinutes")).doubleValue());
        }
        
        // Recent failures
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        List<ProcessingFailureResponse> recentFailures = scanRepository.findFailedScans(sevenDaysAgo)
            .stream()
            .map(scan -> new ProcessingFailureResponse(
                scan.getId(),
                scan.getDomain().getUrl(),
                scan.getCreatedAt(),
                scan.getStartedAt(),
                scan.getFinishedAt()
                // Calculate duration and findings count
            ))
            .collect(Collectors.toList());
        metrics.setRecentFailures(recentFailures);
        
        return metrics;
    }
    
    private Double calculatePercentage(Long count, Long total) {
        if (total == 0) return 0.0;
        return Math.round((count * 100.0 / total) * 100.0) / 100.0;
    }
}
```

## 4. Admin Controller

```java
// src/main/java/br/utfpr/websec/controller/AdminController.java
package br.utfpr.websec.controller;

import br.utfpr.websec.dto.AdminDashboardMetricsResponse;
import br.utfpr.websec.service.AdminDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {
    
    private final AdminDashboardService adminDashboardService;
    
    /**
     * Get comprehensive admin dashboard metrics
     * Requires ADMIN role
     */
    @GetMapping("/dashboard/metrics")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<AdminDashboardMetricsResponse> getDashboardMetrics() {
        AdminDashboardMetricsResponse metrics = adminDashboardService.getDashboardMetrics();
        return ResponseEntity.ok(metrics);
    }
    
    /**
     * Get scan metrics only
     * Requires ADMIN role
     */
    @GetMapping("/dashboard/scans")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getScanMetrics() {
        return ResponseEntity.ok(adminDashboardService.getScanMetrics());
    }
    
    /**
     * Get finding metrics only
     * Requires ADMIN role
     */
    @GetMapping("/dashboard/findings")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getFindingMetrics() {
        return ResponseEntity.ok(adminDashboardService.getFindingMetrics());
    }
    
    /**
     * Get user metrics only
     * Requires ADMIN role
     */
    @GetMapping("/dashboard/users")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getUserMetrics() {
        return ResponseEntity.ok(adminDashboardService.getUserMetrics());
    }
    
    /**
     * Get performance metrics only
     * Requires ADMIN role
     */
    @GetMapping("/dashboard/performance")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getPerformanceMetrics() {
        return ResponseEntity.ok(adminDashboardService.getPerformanceMetrics());
    }
}
```

## 5. Security Configuration

Add to your `SecurityConfig.java`:

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .authorizeHttpRequests(auth -> auth
            // Admin endpoints require ADMIN role
            .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
            // ... other configurations
        )
        .exceptionHandling(exceptions -> exceptions
            .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            .accessDeniedHandler((request, response, exception) -> {
                response.setStatus(HttpStatus.FORBIDDEN.value());
                response.getWriter().write("{\"error\": \"Access Denied - ADMIN role required\"}");
            })
        )
        // ... other configurations
        .build();
    return http;
}
```

## 6. Implementation Checklist

- [ ] Create all DTO classes
- [ ] Add @Query methods to repositories
- [ ] Implement AdminDashboardService
- [ ] Create AdminController with @PreAuthorize annotations
- [ ] Update SecurityConfig to handle admin route authorization
- [ ] Add admin endpoint documentation (Swagger/Springdoc-openapi)
- [ ] Create unit tests for the service layer
- [ ] Create integration tests for the controller
- [ ] Create database views for performance optimization
- [ ] Test access control (non-admin users should get 403)
- [ ] Performance test with large datasets

## 7. Performance Considerations

1. **Caching**: Consider using `@Cacheable` for metrics that don't change frequently
   ```java
   @Cacheable(value = "adminDashboardMetrics", unless = "#result == null")
   public AdminDashboardMetricsResponse getDashboardMetrics() { ... }
   ```

2. **Database Indexing**: Ensure indexes exist on:
   - `scans.created_at`
   - `scans.status`
   - `findings.severity`
   - `findings.scan_id`

3. **Pagination**: For large datasets, consider paginating results

4. **Async Loading**: Consider returning different metric groups asynchronously

## 8. Testing Strategy

```java
@SpringBootTest
class AdminDashboardServiceTest {
    
    @Test
    @WithMockUser(roles = "ADMIN")
    void testGetDashboardMetrics() {
        // Test that admin can access metrics
    }
    
    @Test
    public void testNonAdminCannotAccessMetrics() {
        // Test that non-admin gets 403
    }
}
```

## Next Steps

1. Implement the DTOs and repository methods
2. Create the AdminDashboardService
3. Set up the AdminController with proper authorization
4. Test the endpoints with admin and regular users
5. Integrate with frontend dashboard UI
6. Monitor performance and optimize as needed
