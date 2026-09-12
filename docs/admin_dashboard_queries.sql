-- ============================================================================
-- WEBSEC INSPECTOR - ADMIN DASHBOARD METRICS QUERIES
-- Database Queries for Administrative Monitoring and KPI Tracking
-- ============================================================================

-- ============================================================================
-- 1. SCANS BY PERIOD (Priority)
-- ============================================================================
-- Returns scan count grouped by day (customize TIME_FORMAT as needed)
-- Useful for trend analysis and workload monitoring

-- Daily scans (last 30 days)
SELECT 
    DATE(s.created_at) as period_date,
    COUNT(*) as total_scans,
    SUM(CASE WHEN s.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_scans,
    SUM(CASE WHEN s.status = 'FAILED' THEN 1 ELSE 0 END) as failed_scans,
    SUM(CASE WHEN s.status = 'RUNNING' THEN 1 ELSE 0 END) as running_scans
FROM scans s
WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY DATE(s.created_at)
ORDER BY period_date DESC;

-- Weekly scans (last 12 weeks)
SELECT 
    YEARWEEK(s.created_at) as week,
    YEAR(s.created_at) as year,
    WEEK(s.created_at) as week_number,
    COUNT(*) as total_scans,
    SUM(CASE WHEN s.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_scans,
    SUM(CASE WHEN s.status = 'FAILED' THEN 1 ELSE 0 END) as failed_scans
FROM scans s
WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
GROUP BY YEARWEEK(s.created_at)
ORDER BY week DESC;

-- Monthly scans (last 12 months)
SELECT 
    DATE_FORMAT(s.created_at, '%Y-%m') as period_month,
    COUNT(*) as total_scans,
    SUM(CASE WHEN s.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_scans,
    SUM(CASE WHEN s.status = 'FAILED' THEN 1 ELSE 0 END) as failed_scans
FROM scans s
WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY DATE_FORMAT(s.created_at, '%Y-%m')
ORDER BY period_month DESC;


-- ============================================================================
-- 2. SCANS BY STATE (Priority)
-- ============================================================================
-- Real-time scan status distribution
-- Useful for understanding current system state and bottlenecks

SELECT 
    s.status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM scans), 2) as percentage
FROM scans s
GROUP BY s.status
ORDER BY count DESC;

-- Detailed status breakdown with additional context
SELECT 
    s.status,
    COUNT(*) as total_count,
    COUNT(DISTINCT s.domain_id) as unique_domains,
    COUNT(DISTINCT d.user_id) as unique_users,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM scans), 2) as percentage,
    MIN(s.created_at) as oldest_scan,
    MAX(s.created_at) as newest_scan
FROM scans s
LEFT JOIN domains d ON s.domain_id = d.id
GROUP BY s.status
ORDER BY total_count DESC;

-- Scans stuck in QUEUED or RUNNING state (potential issues)
SELECT 
    s.id,
    s.status,
    d.url as domain_url,
    s.created_at,
    s.started_at,
    TIMESTAMPDIFF(HOUR, s.created_at, NOW()) as hours_in_current_state
FROM scans s
JOIN domains d ON s.domain_id = d.id
WHERE s.status IN ('QUEUED', 'RUNNING')
ORDER BY s.created_at ASC;


-- ============================================================================
-- 3. SEVERITY DISTRIBUTION (Priority)
-- ============================================================================
-- Aggregate findings by severity level across all scans
-- Useful for security posture overview

-- Overall severity distribution (all findings ever)
SELECT 
    f.severity,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM findings), 2) as percentage,
    ROUND(AVG(f.cvss_score), 2) as avg_cvss_score,
    MAX(f.cvss_score) as max_cvss_score
FROM findings f
GROUP BY f.severity
ORDER BY 
    CASE 
        WHEN f.severity = 'CRITICAL' THEN 1
        WHEN f.severity = 'HIGH' THEN 2
        WHEN f.severity = 'MEDIUM' THEN 3
        WHEN f.severity = 'LOW' THEN 4
    END;

-- Severity distribution from completed scans only (recent period)
SELECT 
    f.severity,
    COUNT(*) as count,
    COUNT(DISTINCT f.scan_id) as affected_scans,
    ROUND(COUNT(*) * 100.0 / (
        SELECT COUNT(*) FROM findings f2
        JOIN scans s2 ON f2.scan_id = s2.id
        WHERE s2.status = 'COMPLETED' 
          AND s2.finished_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    ), 2) as percentage
FROM findings f
JOIN scans s ON f.scan_id = s.id
WHERE s.status = 'COMPLETED' 
  AND s.finished_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY f.severity
ORDER BY 
    CASE 
        WHEN f.severity = 'CRITICAL' THEN 1
        WHEN f.severity = 'HIGH' THEN 2
        WHEN f.severity = 'MEDIUM' THEN 3
        WHEN f.severity = 'LOW' THEN 4
    END;

-- Severity distribution by OWASP category
SELECT 
    f.owasp_category,
    f.severity,
    COUNT(*) as count,
    ROUND(AVG(f.cvss_score), 2) as avg_cvss_score
FROM findings f
GROUP BY f.owasp_category, f.severity
ORDER BY 
    f.owasp_category,
    CASE 
        WHEN f.severity = 'CRITICAL' THEN 1
        WHEN f.severity = 'HIGH' THEN 2
        WHEN f.severity = 'MEDIUM' THEN 3
        WHEN f.severity = 'LOW' THEN 4
    END;


-- ============================================================================
-- 4. ADDITIONAL METRICS (from acceptance criteria)
-- ============================================================================

-- USER COUNT
SELECT 
    COUNT(*) as total_users,
    SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) as admin_count,
    SUM(CASE WHEN role = 'USER' THEN 1 ELSE 0 END) as regular_user_count,
    COUNT(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as new_users_last_30_days
FROM users;

-- USERS BY CREATION PERIOD
SELECT 
    DATE_FORMAT(created_at, '%Y-%m') as period,
    COUNT(*) as new_users
FROM users
GROUP BY DATE_FORMAT(created_at, '%Y-%m')
ORDER BY period DESC;


-- PROCESSING FAILURES
-- Count of failed scans with reasons
SELECT 
    s.status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM scans WHERE status = 'FAILED'), 2) as percentage_of_failures
FROM scans s
WHERE s.status = 'FAILED'
GROUP BY s.status;

-- Failed scans with detailed info (for debugging)
SELECT 
    s.id as scan_id,
    d.url as domain_url,
    s.created_at,
    s.started_at,
    s.finished_at,
    TIMESTAMPDIFF(MINUTE, s.started_at, s.finished_at) as duration_minutes,
    (SELECT COUNT(*) FROM findings WHERE scan_id = s.id) as findings_count
FROM scans s
JOIN domains d ON s.domain_id = d.id
WHERE s.status = 'FAILED'
ORDER BY s.finished_at DESC
LIMIT 100;


-- AVERAGE EXECUTION TIME
-- Execution time statistics for completed scans
SELECT 
    COUNT(*) as completed_scans,
    ROUND(AVG(TIMESTAMPDIFF(MINUTE, s.started_at, s.finished_at)), 2) as avg_execution_minutes,
    ROUND(MIN(TIMESTAMPDIFF(MINUTE, s.started_at, s.finished_at)), 2) as min_execution_minutes,
    ROUND(MAX(TIMESTAMPDIFF(MINUTE, s.started_at, s.finished_at)), 2) as max_execution_minutes,
    ROUND(STD(TIMESTAMPDIFF(MINUTE, s.started_at, s.finished_at)), 2) as std_dev_execution_minutes
FROM scans s
WHERE s.status = 'COMPLETED' 
  AND s.started_at IS NOT NULL 
  AND s.finished_at IS NOT NULL
  AND s.finished_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY);

-- Execution time by time period (to identify slow periods)
SELECT 
    DATE_FORMAT(s.finished_at, '%Y-%m-%d %H:00:00') as period_hour,
    COUNT(*) as completed_scans,
    ROUND(AVG(TIMESTAMPDIFF(MINUTE, s.started_at, s.finished_at)), 2) as avg_execution_minutes
FROM scans s
WHERE s.status = 'COMPLETED' 
  AND s.started_at IS NOT NULL 
  AND s.finished_at IS NOT NULL
  AND s.finished_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY DATE_FORMAT(s.finished_at, '%Y-%m-%d %H:00:00')
ORDER BY period_hour DESC;


-- ============================================================================
-- 5. COMPREHENSIVE DASHBOARD OVERVIEW
-- ============================================================================
-- Single query combining multiple metrics (consider performance)

SELECT 
    -- Scan metrics
    (SELECT COUNT(*) FROM scans) as total_scans,
    (SELECT COUNT(*) FROM scans WHERE status = 'COMPLETED') as completed_scans,
    (SELECT COUNT(*) FROM scans WHERE status = 'FAILED') as failed_scans,
    (SELECT COUNT(*) FROM scans WHERE status IN ('QUEUED', 'RUNNING', 'PENDING_VERIFICATION')) as pending_scans,
    
    -- Finding metrics
    (SELECT COUNT(*) FROM findings) as total_findings,
    (SELECT COUNT(*) FROM findings WHERE severity = 'CRITICAL') as critical_findings,
    (SELECT COUNT(*) FROM findings WHERE severity = 'HIGH') as high_findings,
    (SELECT COUNT(*) FROM findings WHERE severity = 'MEDIUM') as medium_findings,
    (SELECT COUNT(*) FROM findings WHERE severity = 'LOW') as low_findings,
    
    -- User metrics
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') as admin_users,
    
    -- Execution time metrics
    (SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, started_at, finished_at)), 2) 
     FROM scans 
     WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND finished_at IS NOT NULL
    ) as avg_execution_minutes;


-- ============================================================================
-- 6. HELPER VIEWS (Optional: Create for simplification)
-- ============================================================================

-- Create a view for daily metrics
CREATE OR REPLACE VIEW admin_dashboard_daily_metrics AS
SELECT 
    DATE(s.created_at) as metric_date,
    COUNT(DISTINCT s.id) as daily_scans,
    COUNT(DISTINCT CASE WHEN s.status = 'COMPLETED' THEN s.id END) as completed_today,
    COUNT(DISTINCT CASE WHEN s.status = 'FAILED' THEN s.id END) as failed_today,
    COUNT(DISTINCT f.id) as findings_created,
    COUNT(DISTINCT CASE WHEN f.severity = 'CRITICAL' THEN f.id END) as critical_findings_today,
    COUNT(DISTINCT CASE WHEN f.severity = 'HIGH' THEN f.id END) as high_findings_today
FROM scans s
LEFT JOIN findings f ON s.id = f.scan_id AND DATE(f.scan_id) = DATE(s.created_at)
GROUP BY DATE(s.created_at);

-- Create a view for status distribution
CREATE OR REPLACE VIEW admin_dashboard_status_distribution AS
SELECT 
    s.status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM scans), 2) as percentage
FROM scans s
GROUP BY s.status;

-- Create a view for severity distribution
CREATE OR REPLACE VIEW admin_dashboard_severity_distribution AS
SELECT 
    f.severity,
    COUNT(*) as count,
    ROUND(AVG(f.cvss_score), 2) as avg_cvss_score,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM findings), 2) as percentage
FROM findings f
GROUP BY f.severity;
