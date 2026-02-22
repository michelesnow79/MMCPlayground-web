import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const getPattern = () => {
    const arg = args.find(a => a.startsWith('--pattern='));
    if (arg) return arg.split('=')[1];
    return 'fanout';
};

const PATTERN = getPattern();
const USERS_LADDER = [5, 10, 25, 50, 100];
const RESULTS = [];

console.log(`\n📈 AUTOMATED SCALING LADDER TEST [Pattern: ${PATTERN.toUpperCase()}]`);
console.log("Steps:", USERS_LADDER.join(" -> "));
console.log("-".repeat(50));

for (const users of USERS_LADDER) {
    if (RESULTS.length > 0) {
        console.log(`⏳ Cooling down Auth (10s)...`);
        await new Promise(r => setTimeout(r, 10000));
    }
    console.log(`\n🏃 Running Step: ${users} Users...`);

    const result = spawnSync('node', [
        'tools/stress/production-load-test.js',
        `--users=${users}`,
        '--duration=30',
        '--rps=1',
        `--pattern=${PATTERN}`,
        '--json'
    ], {
        env: { ...process.env, CONFIRM_PROD: 'YES' },
        encoding: 'utf8'
    });

    try {
        const outputLines = result.stdout.trim().split('\n');
        let data = null;
        for (const line of outputLines.reverse()) {
            try {
                const parsed = JSON.parse(line);
                if (parsed && parsed.users) {
                    data = parsed;
                    break;
                }
            } catch (e) {
                // Not JSON, continue
            }
        }

        if (!data) throw new Error("No JSON results found in output");

        RESULTS.push({
            "Users": data.users,
            "Msg/s": data.throughput,
            "p50": data.p50,
            "p95": data.p95,
            "p99": data.p99,
            "Succeeded": data.succeeded,
            "Observed": data.observed,
            "Missing": data.missing,
            "Duplicates": data.duplicates,
            "Errors": data.errorCount,
            "Success%": `${data.attempted > 0 ? ((data.succeeded / data.attempted) * 100).toFixed(1) : 0}%`
        });
    } catch (e) {
        console.error(`⚠️ Could not parse results for step ${users}: ${e.message}`);
        if (result.stdout) console.error("STDOUT:", result.stdout);
        if (result.stderr) console.error("STDERR:", result.stderr);
        RESULTS.push({ "Users": users, "Status": "FAILED" });
    }
}

console.log("\n" + "=".repeat(80));
console.log(`🏆 FINAL SCALING REPORT [${PATTERN.toUpperCase()}]`);
console.log("=".repeat(80));
console.table(RESULTS);

// Export results
const reportDir = path.resolve(__dirname, 'reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

const jsonPath = path.join(reportDir, `latest-scale-${PATTERN}.json`);
fs.writeFileSync(jsonPath, JSON.stringify({ pattern: PATTERN, timestamp: new Date().toISOString(), results: RESULTS }, null, 2));

const mdPath = path.join(reportDir, `latest-scale.md`);
// Append mode for .md if running multiple? Or just overwrite. 
// User said: tools/stress/reports/latest-scale.md (table + short commentary)
// I'll overwrite but maybe include both patterns in the commentary.

let mdContent = `## Scaling Ladder Report - ${PATTERN.toUpperCase()}\n`;
mdContent += `**Timestamp:** ${new Date().toISOString()}\n\n`;
mdContent += `| Users | Msg/s | p50 | p95 | p99 | Succeeded | Observed | Missing | Duplicates | Errors | Success % |\n`;
mdContent += `|-------|-------|-----|-----|-----|-----------|----------|---------|------------|--------|-----------|\n`;

RESULTS.forEach(r => {
    mdContent += `| ${r.Users} | ${r["Msg/s"]} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.Succeeded} | ${r.Observed} | ${r.Missing} | ${r.Duplicates} | ${r.Errors} | ${r["Success%"]} |\n`;
});

mdContent += `\n### Commentary\n`;
if (PATTERN === 'fanin') {
    mdContent += `- **Fan-in Contention:** High stress on the single thread document. Expect increased latency and potential contention errors at higher user counts.\n`;
} else {
    mdContent += `- **Fan-out Distribution:** Realistic load across multiple threads. Validates general Firestore write/fan-out capacity.\n`;
}

// Check for "knee"
const knee = RESULTS.find(r => r.Missing > 0 || (r.Errors > 0 && r["Success%"] && parseFloat(r["Success%"]) < 98));
if (knee) {
    mdContent += `- **Scaling Knee Detected:** Performance impact observed at **${knee.Users} users**. Recommended to review Firestore indexing or application backpressure strategies.\n`;
} else {
    mdContent += `- **Scaling Status:** All tested steps (up to ${USERS_LADDER[USERS_LADDER.length - 1]} users) passed without significant data loss or error spikes.\n`;
}

// Append or Overwrite? Let's use append for the MD so both patterns end up there if run sequentially.
if (fs.existsSync(mdPath)) {
    fs.appendFileSync(mdPath, "\n---\n\n" + mdContent);
} else {
    fs.writeFileSync(mdPath, mdContent);
}

console.log(`\n💾 Reports saved to: ${reportDir}`);

const hasFailures = RESULTS.some(r => r.Status === 'FAILED' || (r["Missing"] > 0));
process.exit(hasFailures ? 1 : 0);
