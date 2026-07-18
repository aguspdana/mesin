// Scenario 4: Object params (the headline caching claim).
//
// We call a family with an OBJECT param. Each call builds a *fresh* object with
// one of a few logical shapes (new reference, same content) — exactly what
// happens when a component renders `family({ id, kind })` inline.
//
//   - mesin `compute`             -> serializes the param to a string key: cache
//                                    hit by value, one node per shape.
//   - jotai atomFamily (default)  -> keys by reference (Object.is): every call
//                                    MISSES, creates a new atom, recomputes, and
//                                    never frees it (memory grows). We bound the
//                                    run so it can't OOM, and print the leak below.
//   - jotai atomFamily (string)   -> the fair apples-to-apples rival: do exactly
//                                    what mesin does internally — serialize the
//                                    param to a string and key an atomFamily by
//                                    it. O(1) Map lookup AND bounded memory.
//   - jotai atomFamily (+ eq)     -> a custom param-equality, so it hits — but
//                                    must linear-scan existing keys to find a match.
//
// Every warm variant keeps its shapes live via a subscriber (mesin `effect`,
// jotai `store.sub`), so all three measure a warm-cache read. This matters for
// mesin: an *unsubscribed* compute node reschedules a removal timer on every
// read (`scheduleRemoval` -> setTimeout/clearTimeout), which would tax mesin with
// timer churn that has no jotai analogue. Keeping the nodes live avoids it.
//
// Bounded iterations (the default family leaks by design).

import { atomFamily } from "jotai-family";
import { atom, createStore } from "jotai/vanilla";
import { compute, effect, store } from "mesin";
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

// The string form of a key — this is what a jotai user would serialize to, and
// mirrors mesin's own internal `stringify(param)`.
const strKey = (k: Key): string => `${k.id}:${k.kind}`;

const keyEq = (a: Key, b: Key) => a.id === b.id && a.kind === b.kind;

export const run = (): {
    result: { title: string; rows: Row[] };
    leak: string;
} => {
    // --- mesin: keep every shape's node live so reads hit a warm cache (and so
    // an unsubscribed node doesn't churn a removal timer per read). ---
    const mbase = store(10);
    const mfam = compute((k: Key) => mbase.get() + k.id);
    for (const s of SHAPES) {
        effect(() => mfam({ id: s.id, kind: s.kind }).get());
    }

    // --- jotai default atomFamily (reference keys): leaks, kept unmounted since
    // mounting can't fix the ref-key miss — every fresh object is a new atom. ---
    const jStore = createStore();
    const jbase = atom(10);
    const jfam = atomFamily((k: Key) => atom((get) => get(jbase) + k.id));

    // --- jotai atomFamily keyed by a serialized string (mesin's own strategy) ---
    const jsStore = createStore();
    const jsbase = atom(10);
    const jsfam = atomFamily((key: string) =>
        atom((get) => get(jsbase) + Number(key.split(":")[0]))
    );
    for (const s of SHAPES) {
        jsStore.sub(jsfam(strKey(s)), () => {});
    }

    // --- jotai atomFamily with custom param equality ---
    const jeStore = createStore();
    const jebase = atom(10);
    const jefam = atomFamily(
        (k: Key) => atom((get) => get(jebase) + k.id),
        keyEq
    );
    for (const s of SHAPES) {
        jeStore.sub(jefam({ id: s.id, kind: s.kind }), () => {});
    }

    const result = compare(
        "4. Object params  (fresh object ref each call)",
        {
            mesin: () => {
                mfam(freshKey()).get();
            },
            "jotai (atomFamily)": () => {
                jStore.get(jfam(freshKey()));
            },
            "jotai (atomFamily, string key)": () => {
                jsStore.get(jsfam(strKey(freshKey())));
            },
            "jotai (atomFamily + eq)": () => {
                jeStore.get(jefam(freshKey()));
            },
        },
        { warmup: 1_000, samples: 5, iters: 20_000 }
    );

    // Show the leak: how many atoms the default family is holding on to, versus
    // the bounded families (mesin and the string-keyed jotai both hold 8).
    const jfamSize = Array.from(jfam.getParams()).length;
    const jsfamSize = Array.from(jsfam.getParams()).length;
    const leak =
        `jotai default atomFamily retained ${jfamSize.toLocaleString()} atoms ` +
        `(one per call, never freed). mesin holds 8, and the string-keyed ` +
        `atomFamily holds ${jsfamSize} — one per shape, no leak.`;

    return { result, leak };
};
