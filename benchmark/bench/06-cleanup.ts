// Scenario 6: Cleanup after unsubscribe (the "no memory leak" claim).
//
// This is a correctness/behavior check, not a speed one — and we make it
// deterministic instead of guessing at noisy heap numbers. Both sides use a
// *derived* node (mesin `compute`, jotai a derived `atom` reading a base) so the
// comparison is like-for-like, and we instrument the compute fns to count work.
//
// We build a family with N distinct params and subscribe to all of them, then
// drop every subscription, wait, and re-read — measuring the SAME two quantities
// on both sides:
//   1. Does re-reading recompute (was the cached value freed)?
//   2. How many nodes/atoms does the family still hold?
//
//   - mesin removes an unused compute node ~1s after its last subscriber leaves.
//     After the wait, re-reading RE-COMPUTES all N (they were freed and rebuilt).
//     Note this auto-GC is not free: mesin arms a `setTimeout` per node when its
//     last subscriber leaves (and churns clear/reschedule on unsubscribed reads).
//   - jotai's atomFamily keeps every atom it ever made in its internal map AND
//     keeps its cached value warm: after everyone unsubscribes, re-reading is a
//     cache hit (0 recomputes) and `getParams()` still returns all N. So jotai
//     retains both the atom object and the value. jotai-family CAN evict — via
//     `.remove(param)` or the opt-in `setShouldRemove` predicate (lazy, checked on
//     access) — but it does not auto-GC on a timer the way mesin does.

import {
    signal,
    computed,
    effect as psEffect,
} from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";
import { atomFamily } from "jotai-family";
import { atom, createStore } from "jotai/vanilla";
import { compute, effect, store } from "mesin";
import { sleep } from "../harness.js";

const N = 5_000;

export const run = async (): Promise<{ title: string; lines: string[] }> => {
    const lines: string[] = [];

    // --- mesin: unused nodes get removed, so re-reading has to recompute ---
    let mComputes = 0;
    const mbase = store(1);
    const mfam = compute((p: number) => {
        mComputes++;
        return mbase.get() + p;
    });
    const disposers = Array.from({ length: N }, (_, p) =>
        effect(() => mfam(p).get())
    );
    const mWhileSubscribed = mComputes; // N: each node computed once
    disposers.forEach((d) => d()); // everyone unsubscribes
    await sleep(1_500); // mesin removes nodes ~1s after last subscriber
    mComputes = 0;
    for (let p = 0; p < N; p++) {
        mfam(p).get(); // re-read all N
    }
    const mRebuilt = mComputes;
    lines.push(
        `mesin:  ${mWhileSubscribed.toLocaleString()} nodes computed while subscribed; ` +
            `after unsubscribe, re-reading recomputed ${mRebuilt.toLocaleString()}/${N.toLocaleString()} ` +
            `→ nodes were freed and rebuilt (no retention).`
    );

    // --- jotai: the family map keeps every atom, and its value, forever ---
    let jComputes = 0;
    const jstore = createStore();
    const jbase = atom(1);
    const jfam = atomFamily((p: number) =>
        atom((get) => {
            jComputes++;
            return get(jbase) + p;
        })
    );
    const unsubs = Array.from({ length: N }, (_, p) =>
        jstore.sub(jfam(p), () => {})
    );
    const jWhileSubscribed = jComputes;
    unsubs.forEach((u) => u()); // everyone unsubscribes
    await sleep(1_500);
    jComputes = 0;
    for (let p = 0; p < N; p++) {
        jstore.get(jfam(p)); // re-read all N
    }
    const jRebuilt = jComputes;
    const retained = Array.from(jfam.getParams()).length;
    lines.push(
        `jotai:  ${jWhileSubscribed.toLocaleString()} atoms computed while subscribed; ` +
            `after unsubscribe, re-reading recomputed ${jRebuilt.toLocaleString()}/${N.toLocaleString()} ` +
            `and the family still holds ${retained.toLocaleString()}/${N.toLocaleString()} atoms ` +
            `→ atom + value retained (evict via .remove()/setShouldRemove, not auto-GC).`
    );

    // --- preact: a hand-rolled computed cache. Preact keeps a computed's cached
    // value after its last subscriber leaves, and we hold the node in a Map, so
    // like jotai it retains both until you evict it yourself. ---
    let pComputes = 0;
    const pbase = signal(1);
    const pcache = new Map<number, ReadonlySignal<number>>();
    const pfam = (p: number): ReadonlySignal<number> => {
        let c = pcache.get(p);
        if (!c) {
            c = computed(() => {
                pComputes++;
                return pbase.value + p;
            });
            pcache.set(p, c);
        }
        return c;
    };
    const pdisposers = Array.from({ length: N }, (_, p) =>
        psEffect(() => void pfam(p).value)
    );
    const pWhileSubscribed = pComputes;
    pdisposers.forEach((d) => d()); // everyone unsubscribes
    await sleep(1_500);
    pComputes = 0;
    for (let p = 0; p < N; p++) {
        pfam(p).value; // re-read all N
    }
    const pRebuilt = pComputes;
    lines.push(
        `preact: ${pWhileSubscribed.toLocaleString()} computeds computed while subscribed; ` +
            `after unsubscribe, re-reading recomputed ${pRebuilt.toLocaleString()}/${N.toLocaleString()} ` +
            `and the cache still holds ${pcache.size.toLocaleString()}/${N.toLocaleString()} computeds ` +
            `→ value retained (you dispose the cache yourself; no auto-GC).`
    );

    return {
        title: `6. Cleanup after unsubscribe  (${N.toLocaleString()} nodes)`,
        lines,
    };
};
