// Scenario 3: One computed used in many places (the "compute once" claim).
//
// M consumers all want the SAME derived value (same param). We update the
// source once and let it propagate to all M consumers.
//
//   - mesin `compute`       -> one cached node, computed once, M subscribers.
//   - jotai atom generator  -> each place makes a FRESH atom, so it recomputes
//                              M times (the flaw mesin's README calls out).
//   - jotai atomFamily      -> caches per param, computed once (the fair rival).
//   - preact computed       -> one computed, M effects, computed once.
//
// The derived work is deliberately non-trivial so recompute cost shows up.

import { signal, computed, effect as psEffect } from "@preact/signals-core";
import { atomFamily } from "jotai-family";
import { atom, createStore } from "jotai/vanilla";
import { compute, effect, store } from "mesin";
import { compare } from "../harness.js";
import type { Row } from "../harness.js";

const CONSUMERS = 100;
const PARAM = 7;

const heavy = (base: number, p: number): number => {
    let acc = base + p;
    for (let i = 0; i < 50; i++) {
        acc = (acc + i) % 1_000;
    }
    return acc;
};

export const run = (): { title: string; rows: Row[] } => {
    // --- mesin: one cached compute node, many subscribers ---
    const msrc = store(0);
    const mfam = compute((p: number) => heavy(msrc.get(), p));
    for (let c = 0; c < CONSUMERS; c++) {
        effect(() => mfam(PARAM).get());
    }
    let mi = 0;

    // --- jotai atom generator: a new derived atom per consumer ---
    // Callbacks re-read the value, matching how mesin's effects re-run.
    const jgStore = createStore();
    const jgSrc = atom(0);
    for (let c = 0; c < CONSUMERS; c++) {
        const fresh = atom((get) => heavy(get(jgSrc), PARAM));
        jgStore.sub(fresh, () => jgStore.get(fresh));
    }
    let gi = 0;

    // --- jotai atomFamily: cached per param, one node, many subscribers ---
    const jfStore = createStore();
    const jfSrc = atom(0);
    const jfam = atomFamily((p: number) =>
        atom((get) => heavy(get(jfSrc), p))
    );
    for (let c = 0; c < CONSUMERS; c++) {
        jfStore.sub(jfam(PARAM), () => jfStore.get(jfam(PARAM)));
    }
    let fi = 0;

    // --- preact: one computed, many effects, computed once ---
    const pSrc = signal(0);
    const pShared = computed(() => heavy(pSrc.value, PARAM));
    for (let c = 0; c < CONSUMERS; c++) {
        psEffect(() => void pShared.value);
    }
    let pi = 0;

    return compare(
        `3. Shared computed  (${CONSUMERS} consumers, 1 source update)`,
        {
            mesin: () => {
                msrc.set(++mi);
            },
            "jotai (atom generator)": () => {
                jgStore.set(jgSrc, ++gi);
            },
            "jotai (atomFamily)": () => {
                jfStore.set(jfSrc, ++fi);
            },
            preact: () => {
                pSrc.value = ++pi;
            },
        },
        { iters: 20_000 }
    );
};
