
import http from 'k6/http';
import { check, sleep } from 'k6';

// Environment variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173'; // Default to local dev server
const STRESS_ENV = __ENV.STRESS_ENV || 'local';

// Options: Scenarios and Thresholds
export const options = {
    scenarios: {
        // Ramp up to 200 users over 5 minutes
        ramp_up: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 20 },   // Warm up
                { duration: '2m', target: 200 },   // Ramp to 200
                { duration: '1m', target: 200 },   // Hold usage
                { duration: '30s', target: 0 },    // Ramp down
            ],
            gracefulStop: '30s',
        },
        // Spike distinct from ramp
        // spike: { ... } - Uncomment for spike test configuration
    },
    thresholds: {
        // Define pass/fail criteria
        http_req_duration: ['p(95)<1000'], // 95% of requests must complete below 1s
        http_req_failed: ['rate<0.01'],    // less than 1% errors
    },
};

export default function () {
    // 1. Visit Landing Page
    const res = http.get(`${BASE_URL}/`);

    check(res, {
        'landing status is 200': (r) => r.status === 200,
        'landing text present': (r) => r.body && r.body.includes('Miss Me Connection'), // Verify content
    });

    // 2. Simulate user "think time" (reading page)
    sleep(1);

    // 3. Visit Map Page (simulating navigation)
    const mapRes = http.get(`${BASE_URL}/map`);
    check(mapRes, {
        'map page status is 200': (r) => r.status === 200,
    });

    // 4. Visit Browse Page
    const browseRes = http.get(`${BASE_URL}/browse`);
    check(browseRes, {
        'browse page status is 200': (r) => r.status === 200,
    });

    sleep(Math.random() * 2 + 1); // Random sleep 1-3s
}
