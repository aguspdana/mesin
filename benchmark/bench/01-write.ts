// Scenario 1: Write & propagate (baseline engine speed).
//
// One source -> one derived (value + 1), with a live subscriber. Each op writes
// a new value to the source and reads the derived result. This is the simplest
// "state changed, recompute" cycle.

import { signal, computed, effect as psEffect } from "@preact/signals-core";
import { atom, createStore } from "jotai/vanilla";
import { compute, effect, store } from "mesin";
import { createStore as zustand } from "zustand/vanilla";
import { compare, sink } from "../harness.js";
import type { Row } from "../harness.js";

// The trailing read is sunk (see harness `sink`) so it can't be eliminated. The
// reads have side effects so DCE is unlikely, but sinking makes it robust.
export const run = (): { title: string; rows: Row[] } => {
    // --- mesin ---
    const ms = store(0);
    const md = compute(() => ms.get() + 1);
    effect(() => md().get()); // keep the derived live (push-based)
    let mi = 0;

    // --- jotai ---
    const js = createStore();
    const ja = atom(0);
    const jd = atom((get) => get(ja) + 1);
    js.sub(jd, () => {}); // keep the derived live
    let ji = 0;

    // --- preact signals ---
    const ps = signal(0);
    const pd = computed(() => ps.value + 1);
    psEffect(() => void pd.value); // keep the derived live
    let pi = 0;

    // --- zustand: no computed graph, so the "derived" is a function of state
    // recomputed on every read (the idiomatic zustand pattern). ---
    const zs = zustand(() => ({ n: 0 }));
    zs.subscribe(() => {}); // a live subscriber
    let zi = 0;

    return compare("1. Write & propagate  (1 source -> 1 derived)", {
        mesin: () => {
            ms.set(++mi);
            sink.value = md().get();
        },
        jotai: () => {
            js.set(ja, ++ji);
            sink.value = js.get(jd);
        },
        preact: () => {
            ps.value = ++pi;
            sink.value = pd.value;
        },
        "zustand (derive on read)": () => {
            zs.setState({ n: ++zi });
            sink.value = zs.getState().n + 1;
        },
    });
};
