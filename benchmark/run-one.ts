// Runs ONE scenario, then exits. Invoked once per scenario by run.ts in a fresh
// child process, so no scenario can pollute another's heap (jotai's atomFamily
// leaks by design in scenario 4, mesin keeps a global MANAGER, and stray removal
// timers fire ~1s later — all of which would otherwise land on later scenarios).
//
//   node --import tsx ./run-one.ts <name>
//
// where <name> is one of the keys in SCENARIOS below.

import { run as write } from "./bench/01-write.js";
import { run as chain } from "./bench/02-chain.js";
import { run as shared } from "./bench/03-shared.js";
import { run as objectParam } from "./bench/04-object-param.js";
import { run as selector } from "./bench/05-selector.js";
import { run as cleanup } from "./bench/06-cleanup.js";
import { run as spreadsheet } from "./bench/07-spreadsheet.js";

const SCENARIOS: Record<string, () => void | Promise<void>> = {
    write: () => void write(),
    chain: () => void chain(),
    shared: () => void shared(),
    "object-param": () => {
        const obj = objectParam();
        console.log(`  ${obj.leak}`);
    },
    selector: () => void selector(),
    spreadsheet: () => void spreadsheet(),
    cleanup: async () => {
        const mem = await cleanup();
        console.log(`\n${mem.title}`);
        for (const line of mem.lines) {
            console.log(`  ${line}`);
        }
    },
};

const name = process.argv[2];
const scenario = name ? SCENARIOS[name] : undefined;
if (!scenario) {
    console.error(
        `unknown scenario "${name}". known: ${Object.keys(SCENARIOS).join(", ")}`
    );
    process.exit(1);
}

await scenario();
