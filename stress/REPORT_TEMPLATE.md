
# Stress Test Report - {TIMESTAMP}

## 1. API Load Test (K6)
- **Status**: {PASS/FAIL}
- **P95 Latency**: {K6_P95} ms
- **Error Rate**: {K6_ERROR_RATE} %
- **Link**: [Detailed JSON](./k6_summary.json)

## 2. Web Stress (Playwright)
- **Status**: {PASS/FAIL}
- **Workers**: {WORKER_COUNT}
- **Failed Tests**: {FAILED_COUNT}
- **Link**: [HTML Report](./playwright-report/index.html)

## 3. Android Stability
- **Device**: {DEVICE_NAME}
- **Monkey Crashes**: {CRASH_COUNT}
- **Startup Loop**: {SUCCESS/FAIL}
- **Link**: [Logcat](./monkey_log.txt)

## Conclusion
- [ ] Ready for Release
- [ ] Blocking Issues Found
