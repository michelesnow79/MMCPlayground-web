import { spawnSync } from 'child_process';

const USERS_LADDER = [5, 10, 25, 50, 100];
const RESULTS = [];

console.log("\n📈 AUTOMATED SCscaling LADDER TEST");
console.log("Steps:", USERS_LADDER.join(" -> "));
console.log("-".repeat(50));

for (const users of USERS_LADDER) {
    console.log(`\n🏃 Running Step: ${users} Users...`);

    const result = spawnSync('node', [
        'tools/stress/production-load-test.js',
        `--users=${users}`,
        '--duration=30',
        '--rps=1',
        '--pattern=fanout',
        '--json'
    ], {
        env: { ...process.env, CONFIRM_PROD: 'YES' },
        encoding: 'utf8'
    });

    if (result.status !== 0) {
        console.error(`❌ Step ${users} failed.`);
        if (result.stdout) console.error(result.stdout);
        if (result.stderr) console.error(result.stderr);
        // Continue to see where it breaks, or stop? 
        // User said "don't terminate early if one phase fails" in a previous context, 
        // though that was for the whole suite. I'll continue.
    }

    try {
        const output = result.stdout.trim().split('\n').pop();
        const data = JSON.parse(output);
        RESULTS.push({
            "Users": data.users,
            "Msg/s": data.throughput,
            "p50 (ms)": data.p50,
            "p95 (ms)": data.p95,
            "p99 (ms)": data.p99,
            "Errors": data.errorCount,
            "Success %": `${((data.succeeded / data.attempted) * 100).toFixed(1)}%`
        });
    } catch (e) {
        console.error(`⚠️ Could not parse results for step ${users}`);
        RESULTS.push({ "Users": users, "Status": "FAILED" });
    }
}

console.log("\n" + "=".repeat(60));
console.log("🏆 FINAL SCALING REPORT");
console.log("=".repeat(60));
console.table(RESULTS);

const hasFailures = RESULTS.some(r => r.Status === 'FAILED' || (r["Success %"] && parseFloat(r["Success %"]) < 80));

process.exit(hasFailures ? 1 : 0);
