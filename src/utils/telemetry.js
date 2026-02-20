/**
 * MMC Telemetry & Observability Utility
 * 
 * Rules:
 * 1. NO PII: Never log raw UIDs, emails, message content, or exact coordinates.
 * 2. ENV AWARE: Detailed logs in DEV, summarized metrics in PROD.
 * 3. ANONYMOUS: Use hash or session ID for correlation if needed.
 */

const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'v1.0.0-phase8.5';
const ENV = import.meta.env.MODE;

// --- CONFIG ---
const SAMPLING_RATE = ENV === 'production' ? 0.2 : 1.0; // 20% metrics in prod
const MAX_EVENTS_PER_SESSION = 100;
let eventCount = 0;

const telemetry = {
    // --- METRICS ---
    trackEvent: (name, props = {}) => {
        if (eventCount >= MAX_EVENTS_PER_SESSION) return;

        // Sampling (always track errors/failures, sample successes)
        const isFailure = name.includes('fail') || name.includes('error');
        if (!isFailure && Math.random() > SAMPLING_RATE) return;

        eventCount++;

        const payload = {
            event: name,
            timestamp: new Date().toISOString(),
            env: ENV,
            build: BUILD_ID,
            network: navigator.onLine ? 'online' : 'offline',
            ...props
        };

        if (ENV === 'development') {
            console.log(`📊 [METRIC] ${name}:`, payload);
        }

        // --- PRODUCTION SINK ---
        // if (ENV === 'production') {
        //     fetch('https://your-telemetry-sink.com/collect', {
        //         method: 'POST',
        //         body: JSON.stringify(payload),
        //         keepalive: true // Ensure it sends during page unload
        //     }).catch(() => {}); // Fire and forget
        // }
    },

    trackError: (error, context = {}) => {
        const payload = {
            message: error?.message || 'Unknown Error',
            code: error?.code || 'NO_CODE',
            stack: error?.stack?.split('\n').slice(0, 3).join(' '),
            env: ENV,
            build: BUILD_ID,
            route: window.location.pathname,
            network: navigator.onLine ? 'online' : 'offline',
            ...context
        };

        if (ENV === 'development') {
            console.error(`🚨 [ERROR_REPORT]`, payload);
        }

        // Errors are NEVER sampled
        // if (ENV === 'production') {
        //     fetch('https://your-telemetry-sink.com/errors', {
        //         method: 'POST',
        //         body: JSON.stringify(payload)
        //     }).catch(() => {});
        // }
    },

    // --- PERFORMANCE ---
    timers: {},
    startTimer: (key) => {
        telemetry.timers[key] = performance.now();
    },
    endTimer: (key, props = {}) => {
        if (telemetry.timers[key]) {
            const duration = Math.round(performance.now() - telemetry.timers[key]);
            telemetry.trackEvent(key, { duration_ms: duration, ...props });
            delete telemetry.timers[key];
            return duration;
        }
    }
};

// --- GLOBAL HANDLERS ---
if (typeof window !== 'undefined') {
    window.onerror = (message, source, lineno, colno, error) => {
        telemetry.trackError(error || { message }, { source: 'window.onerror', line: lineno });
    };

    window.onunhandledrejection = (event) => {
        telemetry.trackError(event.reason, { source: 'unhandledrejection' });
    };
}

export default telemetry;
