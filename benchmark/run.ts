// Runs every scenario and prints the results.
//
//   npm run bench
//
// Scenarios 1-5 and 7 report median ops/sec (higher is better). Scenario 4 also
// prints a memory-leak line; scenario 6 checks cleanup behavior. All comparisons
// use the vanilla, React-free cores of both libraries, so the numbers reflect the
// reactive engines, not React.

import { run as write } from "./bench/01-write.js";
import { run as chain } from "./bench/02-chain.js";
import { run as shared } from "./bench/03-shared.js";
import { run as objectParam } from "./bench/04-object-param.js";
import { run as selector } from "./bench/05-selector.js";
import { run as cleanup } from "./bench/06-cleanup.js";
import { run as spreadsheet } from "./bench/07-spreadsheet.js";

const main = async () => {
    console.log("mesin vs jotai — vanilla cores (no React)");
    console.log(
        `node ${process.version} · ${process.platform}/${process.arch}`
    );
    console.log("higher ops/s is better\n" + "=".repeat(52));

    write();
    chain();
    shared();

    const obj = objectParam();
    console.log(`  ${obj.leak}`);

    selector();
    spreadsheet();

    const mem = await cleanup();
    console.log(`\n${mem.title}`);
    for (const line of mem.lines) {
        console.log(`  ${line}`);
    }

    console.log("\n" + "=".repeat(52));
    console.log("done.");
};

main();
