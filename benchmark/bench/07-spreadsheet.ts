// Scenario 7: Spreadsheet recalc (many cells, deep chains).
//
// A grid of COLS columns x ROWS rows. Column 0 holds input cells (writable).
// Every other cell is a formula that sums two cells from the previous column:
//
//     cell[c][r] = cell[c-1][r] + cell[c-1][(r+1) % ROWS]
//
// So dependencies run COLS deep (a long chain) and each cell feeds two cells in
// the next column — a shared DAG, like real spreadsheet formulas. The last
// column's cells are the outputs and are kept live by subscribers.
//
// One op = one spreadsheet recalc: edit a single input cell, then read every
// output. Editing one cell dirties a growing cone of cells across all COLS
// levels, so this stresses deep propagation over many nodes.
//
// Built three ways:
//   - mesin (grid):   a 2D array of compute nodes (same graph as jotai).
//   - jotai (grid):   a 2D array of atoms (idiomatic jotai).
//   - mesin (formula): ONE compute addressed by [col, row], referencing itself
//                      recursively — how you'd actually model a spreadsheet in
//                      mesin. Same graph, far less code (but pays a serialize
//                      cost per cell read).

import { atom, createStore } from "jotai/vanilla";
import type { Atom, PrimitiveAtom } from "jotai/vanilla";
import { compute, effect, store } from "mesin";
import { compare } from "../harness.js";
import type { Row } from "../harness.js";

const COLS = 50; // depth of the dependency chain
const ROWS = 50; // cells per column
const EDIT_ROW = 0; // which input cell each op edits

type Reader = () => number;

let mSink = 0;
let jSink = 0;
let fSink = 0;

export const run = (): { title: string; rows: Row[] } => {
    // --- mesin (grid): a 2D array of compute nodes ---
    const mInputs = Array.from({ length: ROWS }, () => store(0));
    const mGrid: Reader[][] = [mInputs.map((s) => () => s.get())];
    for (let c = 1; c < COLS; c++) {
        const prev = mGrid[c - 1];
        mGrid[c] = Array.from({ length: ROWS }, (_, r) => {
            const node = compute(() => prev[r]() + prev[(r + 1) % ROWS]());
            return () => node().get();
        });
    }
    const mOut = mGrid[COLS - 1];
    mOut.forEach((read) => effect(() => read())); // keep outputs live
    let mi = 0;

    // --- jotai (grid): a 2D array of atoms ---
    const jStore = createStore();
    const jInputs: PrimitiveAtom<number>[] = Array.from(
        { length: ROWS },
        () => atom(0)
    );
    const jGrid: Atom<number>[][] = [jInputs];
    for (let c = 1; c < COLS; c++) {
        const prev = jGrid[c - 1];
        jGrid[c] = Array.from({ length: ROWS }, (_, r) =>
            atom((get) => get(prev[r]) + get(prev[(r + 1) % ROWS]))
        );
    }
    const jOut = jGrid[COLS - 1];
    jOut.forEach((a) => jStore.sub(a, () => {})); // keep outputs live
    let ji = 0;

    // --- mesin (formula): one compute addressed by [col, row] ---
    const fInputs = Array.from({ length: ROWS }, () => store(0));
    const cell = compute((coord: number[]): number => {
        const [c, r] = coord;
        if (c === 0) {
            return fInputs[r].get();
        }
        return cell([c - 1, r]).get() + cell([c - 1, (r + 1) % ROWS]).get();
    });
    for (let r = 0; r < ROWS; r++) {
        effect(() => cell([COLS - 1, r]).get());
    }
    let fi = 0;

    const result = compare(
        `7. Spreadsheet recalc  (${COLS}x${ROWS} = ${(COLS * ROWS).toLocaleString()} cells, ${COLS} deep)`,
        {
            "mesin (grid)": () => {
                mInputs[EDIT_ROW].set(++mi);
                let s = 0;
                for (let r = 0; r < ROWS; r++) {
                    s += mOut[r]();
                }
                mSink = s;
            },
            "jotai (grid)": () => {
                jStore.set(jInputs[EDIT_ROW], ++ji);
                let s = 0;
                for (let r = 0; r < ROWS; r++) {
                    s += jStore.get(jOut[r]);
                }
                jSink = s;
            },
            "mesin (formula)": () => {
                fInputs[EDIT_ROW].set(++fi);
                let s = 0;
                for (let r = 0; r < ROWS; r++) {
                    s += cell([COLS - 1, r]).get();
                }
                fSink = s;
            },
        },
        { warmup: 300, samples: 5, iters: 2_000 }
    );

    // Correctness: all three model the same grid, so after the same number of
    // edits their outputs must agree.
    if (mSink !== jSink || mSink !== fSink) {
        console.log(
            `  ! warning: outputs disagree (mesin ${mSink}, jotai ${jSink}, formula ${fSink})`
        );
    } else {
        console.log(`  outputs agree across all three (checksum ${mSink}).`);
    }

    return result;
};
