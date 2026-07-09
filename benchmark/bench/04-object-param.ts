// Scenario 4: Object params (the headline caching claim).
//
// We call a family with an OBJECT param. Each call builds a *fresh* object with
// one of a few logical shapes (new reference, same content) — exactly what
// happens when a component renders `family({ id, kind })` inline.
//
//   - mesin `compute`         -> serializes the param to a string key: cache hit
//                                by value, one node per shape.
//   - jotai atomFamily        -> keys by reference (Object.is): every call MISSES,
//                                creates a new atom, recomputes, and never frees
//                                it (memory grows). We bound the run so it can't
//                                OOM, and print the leak below.
//   - jotai atomFamily + eq   -> a custom param-equality, so it hits — but must
//                                linear-scan existing keys to find the match.
//
// Bounded iterations (this leaks by design for the default family).

import { atomFamily } from "jotai-family";
import { atom, createStore } from "jotai/vanilla";
import { compute, store } from "mesin";
import { compare } from "../harness.js";
import type { Row } from "../harness.js";

// A `type` (not `interface`): mesin's `Param` needs a string index signature,
// which type-alias object literals satisfy but interfaces do not.
type Key = {
    id: number;
    kind: string;
};

const SHAPES: Key[] = [
    { id: 1, kind: "user" },
    { id: 2, kind: "user" },
    { id: 3, kind: "post" },
    { id: 4, kind: "post" },
    { id: 5, kind: "tag" },
    { id: 6, kind: "tag" },
    { id: 7, kind: "org" },
    { id: 8, kind: "org" },
];

// A fresh object each call (new reference), cycling through the logical shapes.
let n = 0;
const freshKey = (): Key => {
    const s = SHAPES[n++ % SHAPES.length];
    return { id: s.id, kind: s.kind };
};

const keyEq = (a: Key, b: Key) => a.id === b.id && a.kind === b.kind;

export const run = (): {
    result: { title: string; rows: Row[] };
    leak: string;
} => {
    // --- mesin: keep every shape's node live so reads hit a warm cache ---
    const mbase = store(10);
    const mfam = compute((k: Key) => mbase.get() + k.id);

    // --- jotai default atomFamily (reference keys) ---
    const jStore = createStore();
    const jbase = atom(10);
    const jfam = atomFamily((k: Key) => atom((get) => get(jbase) + k.id));

    // --- jotai atomFamily with custom param equality ---
    const jeStore = createStore();
    const jebase = atom(10);
    const jefam = atomFamily(
        (k: Key) => atom((get) => get(jebase) + k.id),
        keyEq
    );

    const result = compare(
        "4. Object params  (fresh object ref each call)",
        {
            mesin: () => {
                mfam(freshKey()).get();
            },
            "jotai (atomFamily)": () => {
                jStore.get(jfam(freshKey()));
            },
            "jotai (atomFamily + eq)": () => {
                jeStore.get(jefam(freshKey()));
            },
        },
        { warmup: 1_000, samples: 5, iters: 20_000 }
    );

    // Show the leak: how many atoms the default family is holding on to.
    const jfamSize = Array.from(jfam.getParams()).length;
    const leak =
        `jotai atomFamily retained ${jfamSize.toLocaleString()} atoms ` +
        `(one per call, never freed). mesin holds 8 — one per shape.`;

    return { result, leak };
};
