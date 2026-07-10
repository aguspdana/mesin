// Scenario 2: Deep dependency chain (propagation cost).
//
// source -> d1 -> d2 -> ... -> dN, each adds 1. A subscriber sits on the leaf.
// Each op updates the source and reads the leaf, so the change has to travel
// through every level.

import {
    signal,
    computed,
    effect as psEffect,
} from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";
import { atom, createStore } from "jotai/vanilla";
import type { Atom } from "jotai/vanilla";
import { compute, effect, store } from "mesin";
import { compare, sink } from "../harness.js";
import type { Row } from "../harness.js";

const DEPTH = 50;

// The trailing leaf read is sunk (see harness `sink`) so it can't be eliminated.
export const run = (): { title: string; rows: Row[] } => {
    // --- mesin ---
    const msrc = store(0);
    // `Computed` isn't exported, so let inference name the factory type.
    // Each level is a param-less singleton computed.
    let mnode = compute(() => msrc.get() + 1);
    for (let k = 1; k < DEPTH; k++) {
        const prev = mnode;
        mnode = compute(() => prev().get() + 1);
    }
    const mleaf = mnode;
    effect(() => mleaf().get());
    let mi = 0;

    // --- jotai ---
    const js = createStore();
    const jsrc = atom(0);
    let jnode: Atom<number> = atom((get) => get(jsrc) + 1);
    for (let k = 1; k < DEPTH; k++) {
        const prev = jnode;
        jnode = atom((get) => get(prev) + 1);
    }
    const jleaf = jnode;
    js.sub(jleaf, () => {});
    let ji = 0;

    // --- preact signals ---
    const psrc = signal(0);
    let pnode: ReadonlySignal<number> = computed(() => psrc.value + 1);
    for (let k = 1; k < DEPTH; k++) {
        const prev = pnode;
        pnode = computed(() => prev.value + 1);
    }
    const pleaf = pnode;
    psEffect(() => void pleaf.value);
    let pi = 0;

    return compare(`2. Deep chain  (source -> ${DEPTH} derived -> leaf)`, {
        mesin: () => {
            msrc.set(++mi);
            sink.value = mleaf().get();
        },
        jotai: () => {
            js.set(jsrc, ++ji);
            sink.value = js.get(jleaf);
        },
        preact: () => {
            psrc.value = ++pi;
            sink.value = pleaf.value;
        },
    });
};
