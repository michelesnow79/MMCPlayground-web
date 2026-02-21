
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom Metrics ────────────────────────────────────────────────────────
const errorRate = new Rate('error_rate');
const browseP95 = new Trend('browse_p95');
const searchP95 = new Trend('search_p95');
const detailP95 = new Trend('detail_p95');
const authFailures = new Counter('auth_failures');

// ─── Environment ───────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';

// ─── Scenarios + Thresholds ────────────────────────────────────────────────
export const options = {
    scenarios: {
        // Ramp: 0→200 VUs (5m) hold 10m ramp down 2m
        ramp: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '5m', target: 200 },
                { duration: '10m', target: 200 },
                { duration: '2m', target: 0 },
            ],
            gracefulStop: '30s',
            tags: { scenario: 'ramp' },
        },
        // Spike: 0→500 VUs (30s) hold 2m
        spike: {
            executor: 'ramping-vus',
            startVUs: 0,
            startTime: '17m', // after ramp completes
            stages: [
                { duration: '30s', target: 500 },
                { duration: '2m', target: 500 },
                { duration: '30s', target: 0 },
            ],
            gracefulStop: '30s',
            tags: { scenario: 'spike' },
        },
        // Soak: 50 VUs for 60m (starts after spike)
        soak: {
            executor: 'constant-vus',
            vus: 50,
            duration: '60m',
            startTime: '22m',
            tags: { scenario: 'soak' },
        },
    },
    thresholds: {
        'error_rate': ['rate<0.01'],       // < 1% errors
        'browse_p95': ['p(95)<800'],        // browse p95 < 800ms
        'search_p95': ['p(95)<800'],        // search p95 < 800ms
        'http_req_duration': ['p(95)<2000'],       // global p95 < 2s
        'http_req_failed': ['rate<0.01'],        // < 1% HTTP failures
    },
};

// ─── Helper ────────────────────────────────────────────────────────────────
function hit(url, metricTrend, tag) {
    const res = http.get(url, { tags: { name: tag } });
    const ok = res.status === 200 || res.status === 304;
    errorRate.add(!ok);
    if (metricTrend) metricTrend.add(res.timings.duration);
    check(res, { [`${tag} status OK`]: (r) => r.status >= 200 && r.status < 400 });
    return res;
}

// ─── Main VU Function ──────────────────────────────────────────────────────
export default function () {
    group('Browse Flow', () => {
        // Landing page
        hit(`${BASE_URL}/`, browseP95, 'landing');
        sleep(1);

        // Browse / list
        const browse = hit(`${BASE_URL}/browse`, browseP95, 'browse');
        sleep(Math.random() * 2 + 0.5);

        // Map view
        hit(`${BASE_URL}/map`, browseP95, 'map');
        sleep(0.5);
    });

    group('Search Flow', () => {
        // Simulate search with query param
        hit(`${BASE_URL}/browse?q=connection`, searchP95, 'search');
        sleep(Math.random() + 0.5);
    });

    group('Detail Flow', () => {
        // Open a connection detail (static route; real ID not required for load test)
        hit(`${BASE_URL}/connection/test-id-load`, detailP95, 'detail');
        sleep(0.5);
    });

    group('Auth Wall Flow', () => {
        // Messages page — requires auth, should return the app shell (200)
        const res = hit(`${BASE_URL}/messages`, null, 'auth_wall');
        if (res.status === 401 || res.status === 403) {
            authFailures.add(1);
        }
    });

    // Think time
    sleep(Math.random() * 3 + 1);
}
