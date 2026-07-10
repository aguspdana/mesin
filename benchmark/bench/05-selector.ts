// Scenario 5: Fine-grained selection.
//
// A store holds a wide object. A subscriber only cares about ONE field (`a`).
// Each op mutates a DIFFERENT field (`b`). A fine-grained system notices `a` did
// not change and skips the subscriber entirely; a coarse one re-runs it every
// time.
//
//   - mesin `.select`   vs  mesin `.get` (whole value)
//   - jotai `selectAtom` vs jotai plain subscribe
//   - preact `computed`  vs preact whole-signal effect
//
// Every subscriber runs the SAME non-trivial `work()` payload. This is what makes
// the comparison fair: the point of fine-grained selection is to SKIP that work
// on an unrelated change, so the work has to actually cost something. With an
// empty `() => {}` callback (the earlier version) the fine-grained tools had
// nothing to amortize against, which flattered mesin and hid that jotai's
// `selectAtom` here is a net loss — it adds a derived-atom recompute on every
// change while the callback it "saves" was free. With real work, each tool's
// skip is measured on equal footing.
//
// The immutable `{...obj, b}` copy cost is paid by every variant, so the gap is
// the notification work each approach avoids (or doesn't).

import { signal, computed, effect as psEffect } from "@preact/signals-core";
import { atom, createStore } from "jotai/vanilla";
import { selectAtom } from "jotai/vanilla/utils";
import { effect, store } from "mesin";
import { compare, sink } from "../harness.js";
import type { Row } from "../harness.js";

interface Big {
    a: number;
    b: number;
    [k: string]: number;
}

const makeBig = (): Big => {
    const o: Big = { a: 0, b: 0 };
    for (let i = 0; i < 20; i++) {
        o["f" + i] = i;
    }
    return o;
};

// A non-trivial payload every subscriber runs. Sunk (see harness `sink`) so it
// can't be eliminated. A fine-grained subscriber skips this on an unrelated `b`
// change; a coarse one pays it every op.
const work = (seed: number): number => {
    let acc = seed;
    for (let i = 0; i < 100; i++) {
        acc = (acc + i) % 100_000;
    }
    return acc;
};

export const run = (): { title: string; rows: Row[] } => {
    // --- mesin: subscribe to slice `a` only ---
    const msel = store(makeBig());
    let mSelWork = 0;
    effect(() => {
        const a = msel.select((v) => v.a);
        mSelWork++; // counts how often the subscriber actually re-runs
        sink.value = work(a);
    });

    // --- mesin: subscribe to the whole value ---
    const mall = store(makeBig());
    effect(() => {
        const v = mall.get();
        sink.value = work(v.b);
    });

    // --- jotai: selectAtom on slice `a` ---
    const jsStore = createStore();
    const jsBase = atom(makeBig());
    const jsSlice = selectAtom(jsBase, (v) => v.a);
    jsStore.sub(jsSlice, () => {
        sink.value = work(jsStore.get(jsSlice));
    });

    // --- jotai: subscribe to the whole atom ---
    const jaStore = createStore();
    const jaBase = atom(makeBig());
    jaStore.sub(jaBase, () => {
        sink.value = work(jaStore.get(jaBase).b);
    });

    // --- preact: computed on slice `a` (skips when `a` is unchanged) ---
    const psel = signal(makeBig());
    const pSlice = computed(() => psel.value.a);
    psEffect(() => {
        sink.value = work(pSlice.value);
    });

    // --- preact: effect on the whole signal (re-runs every op) ---
    const pall = signal(makeBig());
    psEffect(() => {
        sink.value = work(pall.value.b);
    });

    const result = compare("5. Selector  (change unrelated field `b`)", {
        "mesin .select": () => {
            const cur = msel.get();
            msel.set({ ...cur, b: cur.b + 1 });
        },
        "mesin .get (whole)": () => {
            const cur = mall.get();
            mall.set({ ...cur, b: cur.b + 1 });
        },
        "jotai selectAtom": () => {
            const cur = jsStore.get(jsBase);
            jsStore.set(jsBase, { ...cur, b: cur.b + 1 });
        },
        "jotai subscribe (whole)": () => {
            const cur = jaStore.get(jaBase);
            jaStore.set(jaBase, { ...cur, b: cur.b + 1 });
        },
        "preact computed": () => {
            const cur = psel.value;
            psel.value = { ...cur, b: cur.b + 1 };
        },
        "preact whole (signal)": () => {
            const cur = pall.value;
            pall.value = { ...cur, b: cur.b + 1 };
        },
    });

    // Sanity: the .select subscriber must NOT have re-run for `b` changes.
    if (mSelWork > 1) {
        console.log(
            `  ! warning: mesin .select subscriber re-ran ${mSelWork} times (expected 1)`
        );
    }

    return result;
};
