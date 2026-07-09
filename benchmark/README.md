# mesin vs Jotai — benchmarks

Small, honest benchmarks comparing **mesin** with **Jotai**.

Both libraries are tested through their **vanilla, React-free cores** (mesin's
`store`/`compute`/`effect`, Jotai's `createStore` + `atom` + `atomFamily`). So
the numbers show the reactive engines, not React.

## Run it

```bash
cd benchmark
npm install   # links the local mesin build via file:..
npm run bench
```

Build mesin first (`npm run build` in the repo root) — the benchmark imports the
shipped `dist`, not the source.

## What each scenario tests

Each scenario maps to a claim mesin makes about itself.

| # | Scenario | What happens | mesin claim |
|---|----------|--------------|-------------|
| 1 | Write & propagate | 1 source → 1 derived, write then read | baseline speed |
| 2 | Deep chain | source → 50 chained derived, update, read leaf | propagation cost |
| 3 | Shared computed | 100 consumers of the same value, 1 update | compute once |
| 4 | Object params | call a family with a fresh object each time | cache by value, no leak |
| 5 | Selector | change a field nobody is watching | skip wasted work |
| 6 | Cleanup | drop every subscriber, then wait | free unused nodes |
| 7 | Spreadsheet | grid of formula cells, edit one, read all outputs | deep dynamic dependency graph |

## Results

From one run (Node 22, Apple Silicon). **Absolute numbers will differ on your
machine — the ratios are the point.** Higher ops/s is better.

| # | Scenario | mesin | Jotai | Winner |
|---|----------|-------|-------|--------|
| 1 | Write & propagate | **1.9M ops/s** | 440k ops/s | mesin ~4x |
| 2 | Deep chain (50 deep) | **69k ops/s** | 12k ops/s | mesin ~6x |
| 3 | Shared (100 consumers) | 38k ops/s | 56k (`atomFamily`) / 3.4k (generator) | **Jotai `atomFamily` ~1.5x** / mesin ~11x over generator |
| 4 | Object params | 1.1M ops/s | 510k (`atomFamily`) / 6.0M (`+ eq`) | mesin ~2x over default; `+ eq` faster but see below |
| 5 | Selector (unrelated change) | **14M ops/s** (`.select`) | 400k (`selectAtom`) | mesin ~35x |
| 6 | Cleanup | frees all 5,000 nodes | keeps all 5,000 atoms | **mesin (no leak)** |
| 7 | Spreadsheet (2,500 cells, 50 deep) | **630 ops/s** (grid) / 550 (formula) | 280 ops/s (grid) | mesin ~2.3x |

### How to read it

- **1, 2, 5 — mesin is clearly faster.** Its signal graph is lighter for writes,
  deep chains, and fine-grained selects. In scenario 5 mesin's `.select` sees the
  watched field didn't change and does nothing; Jotai's `selectAtom` still runs
  its selector on every change.
- **3 — Jotai's cached `atomFamily` wins (by ~1.5x).** mesin re-runs each effect
  on every update, which re-subscribes; that costs more when one value fans out
  to many consumers. But the naive Jotai pattern — a fresh derived atom per place
  (an "atom generator") — recomputes for every consumer and is ~11x slower than
  mesin. So mesin beats the easy Jotai code and loses to the tuned Jotai code.
- **4 — a trade-off.** With object params, mesin serializes the param to a string
  key, so a fresh object with the same content is a cache hit. Jotai's default
  `atomFamily` keys by reference: every call **misses**, makes a new atom, and
  **never frees it** — after 100k calls it held **101,000 atoms** (mesin held 8).
  You can hand Jotai a custom equality function (`+ eq`) to fix the miss; it's
  then the fastest here, but it linear-scans existing keys, so its edge shrinks as
  the number of distinct keys grows, and you have to remember to write it.
- **6 — mesin frees, Jotai leaks.** After every subscriber leaves, re-reading the
  mesin nodes **recomputes** them (they were removed ~1s after the last
  subscriber). Jotai's `atomFamily` still holds every atom it ever made; you must
  call `.remove()` yourself.
- **7 — mesin is ~2x faster on a realistic spreadsheet.** A 50×50 grid of formula
  cells, 50 levels deep, where editing one input recalculates a growing cone of
  dependent cells. mesin recalcs ~2.3x faster than the equivalent jotai atom graph.
  And mesin's **formula-engine** style — one `compute([col, row])` that references
  itself recursively — is nearly as fast (1.15x) while replacing the whole 2D atom
  array with a few lines. A correctness check confirms all three produce identical
  outputs.

## Method

- **Metric:** median ops/s over several timed rounds, after a warmup. Median
  ignores the occasional GC pause. See [harness.ts](harness.ts).
- **Fairness:** same work per op on both sides; both keep values live via a
  subscriber (mesin `effect`, Jotai `store.sub`), and Jotai's subscriber callbacks
  re-read the value to match mesin's effects re-running.
- **Bounded leaks:** scenario 4's default `atomFamily` leaks by design, so its
  iteration count is capped to keep the run from growing without bound.
- **Not measured:** React render behavior, async `query` / async atoms, bundle
  size. These benchmarks are about the sync reactive core only.

> Note: Jotai's family utility comes from the official `jotai-family` package
> (the built-in `jotai/vanilla/utils` `atomFamily` is deprecated). Its behavior is
> the same: keyed by reference, holds every atom until you call `.remove()`.
