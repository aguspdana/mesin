// Scenario 5: Fine-grained selection.
//
// A store holds a wide object. A subscriber only cares about ONE field (`a`).
// Each op mutates a DIFFERENT field (`b`). A fine-grained system notices `a` did
// not change and skips the subscriber entirely; a coarse one re-runs it every
// time.
//
//   - mesin `.select`   vs  mesin `.get` (whole value)
//   - jotai `selectAtom` vs jotai plain subscribe
//
// The immutable `{...obj, b}` copy cost is paid by every variant, so the gap is
// the notification work each approach avoids (or doesn't).

import { atom, createStore } from "jotai/vanilla";
import { selectAtom } from "jotai/vanilla/utils";
import { effect, store } from "mesin";
import { compare } from "../harness.js";
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

export const run = (): { title: string; rows: Row[] } => {
    // --- mesin: subscribe to slice `a` only ---
    const msel = store(makeBig());
    let mSelWork = 0;
    effect(() => {
        msel.select((v) => v.a);
        mSelWork++; // counts how often the subscriber actually re-runs
    });

    // --- mesin: subscribe to the whole value ---
    const mall = store(makeBig());
    effect(() => mall.get());

    // --- jotai: selectAtom on slice `a` ---
    const jsStore = createStore();
    const jsBase = atom(makeBig());
    const jsSlice = selectAtom(jsBase, (v) => v.a);
    jsStore.sub(jsSlice, () => {});

    // --- jotai: subscribe to the whole atom ---
    const jaStore = createStore();
    const jaBase = atom(makeBig());
    jaStore.sub(jaBase, () => {});

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
    });

    // Sanity: the .select subscriber must NOT have re-run for `b` changes.
    if (mSelWork > 1) {
        console.log(
            `  ! warning: mesin .select subscriber re-ran ${mSelWork} times (expected 1)`
        );
    }

    return result;
};
