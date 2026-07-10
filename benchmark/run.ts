// Runs every scenario and prints the results.
//
//   npm run bench
//
// Each scenario runs in its OWN child process (see run-one.ts) so it starts from
// a clean heap: scenario 4 leaks jotai atoms on purpose, mesin keeps a global
// MANAGER across a process, and unsubscribed-read removal timers fire ~1s later —
// isolating scenarios keeps that from skewing whichever scenario runs next.
//
// Scenarios 1-5 and 7 report median ops/sec (higher is better) plus the sampled
// min..max spread. Scenario 4 also prints a memory-leak line; scenario 6 checks
// cleanup behavior. All comparisons use the vanilla, React-free cores of both
// libraries, so the numbers reflect the reactive engines, not React.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUN_ONE = fileURLToPath(new URL("./run-one.ts", import.meta.url));

// Order matches the original single-process run.
const SCENARIOS = [
    "write",
    "chain",
    "shared",
    "object-param",
    "selector",
    "spreadsheet",
    "cleanup",
];

console.log("mesin vs jotai — vanilla cores (no React)");
console.log(`node ${process.version} · ${process.platform}/${process.arch}`);
console.log("higher ops/s is better · each scenario runs in a fresh process");
console.log("=".repeat(52));

for (const name of SCENARIOS) {
    const res = spawnSync(
        process.execPath,
        ["--import", "tsx", RUN_ONE, name],
        { stdio: "inherit" }
    );
    if (res.status !== 0) {
        console.error(`scenario "${name}" failed (exit ${res.status})`);
        process.exit(res.status ?? 1);
    }
}

console.log("\n" + "=".repeat(52));
console.log("done.");
