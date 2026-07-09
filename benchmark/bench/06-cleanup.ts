// Scenario 6: Cleanup after unsubscribe (the "no memory leak" claim).
//
// This is a correctness/behavior check, not a speed one — and we make it
// deterministic instead of guessing at noisy heap numbers.
//
// We build a family with N distinct params and subscribe to all of them, then
// drop every subscription and wait.
//
//   - mesin removes an unused compute node ~1s after its last subscriber leaves.
//     We prove it: after the wait, re-reading the nodes RE-COMPUTES them (they
//     were freed and rebuilt). If mesin leaked, the reads would hit a live cache
//     and recompute 0 times.
//   - jotai's atomFamily keeps every atom it ever made in its internal map. We
//     read that map with `getParams()`: it still holds all N after everyone left.
//     (jotai frees the cached *values* on unsubscribe, but the atom objects — the
//     structural leak — stay until you call `.remove()` yourself.)

import { atomFamily } from "jotai-family";
import { atom, createStore } from "jotai/vanilla";
import { compute, effect } from "mesin";
import { sleep } from "../harness.js";

const N = 5_000;

export const run = async (): Promise<{ title: string; lines: string[] }> => {
    const lines: string[] = [];

    // --- mesin: unused nodes get removed, so re-reading has to recompute ---
    let computes = 0;
    const mfam = compute((p: number) => {
        computes++;
        return p * 2;
    });
    const disposers = Array.from({ length: N }, (_, p) =>
        effect(() => mfam(p).get())
    );
    const whileSubscribed = computes; // N: each node computed once
    disposers.forEach((d) => d()); // everyone unsubscribes
    await sleep(1_500); // mesin removes nodes ~1s after last subscriber
    for (let p = 0; p < N; p++) {
        mfam(p).get(); // re-read all N
    }
    const rebuilt = computes - whileSubscribed;
    lines.push(
        `mesin:  ${whileSubscribed.toLocaleString()} nodes computed while subscribed; ` +
            `re-reading after unsubscribe recomputed ${rebuilt.toLocaleString()}/${N.toLocaleString()} ` +
            `→ nodes were freed and rebuilt (no leak).`
    );

    // --- jotai: the family map keeps every atom, forever ---
    const jstore = createStore();
    const jfam = atomFamily((p: number) => atom(p * 2));
    const unsubs = Array.from({ length: N }, (_, p) =>
        jstore.sub(jfam(p), () => {})
    );
    unsubs.forEach((u) => u()); // everyone unsubscribes
    await sleep(1_500);
    const retained = Array.from(jfam.getParams()).length;
    lines.push(
        `jotai:  after everyone unsubscribed, atomFamily still holds ` +
            `${retained.toLocaleString()}/${N.toLocaleString()} atoms ` +
            `→ structural leak (needs a manual .remove()).`
    );

    return {
        title: `6. Cleanup after unsubscribe  (${N.toLocaleString()} nodes)`,
        lines,
    };
};
