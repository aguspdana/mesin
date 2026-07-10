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

Each scenario runs in its **own child process** (see `run-one.ts`), so one
scenario can't pollute the next one's heap — scenario 4 leaks jotai atoms on
purpose, mesin keeps a global manager per process, and unused-node removal timers
fire ~1s later. Isolation keeps that off whichever scenario runs next.

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

Representative medians from several runs (Node 22, x64). **Absolute numbers will
differ on your machine, and even between runs — the harness prints a `min..max`
spread next to each median so you can see how noisy a number is. Compare medians,
not single winners.** Higher ops/s is better.

| # | Scenario | mesin | Jotai | Winner |
|---|----------|-------|-------|--------|
| 1 | Write & propagate | **~2.6M ops/s** | ~320k ops/s | mesin ~8x |
| 2 | Deep chain (50 deep) | **~100k ops/s** | ~9k ops/s | mesin ~11x |
| 3 | Shared (100 consumers) | ~53k ops/s | ~51k (`atomFamily`) / ~4k (generator) | **near-tie** (within ~10%, flips run to run) / mesin ~14x over generator |
| 4 | Object params | ~2.0M ops/s | ~4.3M (`+ eq`) / ~4.0M (string key) / ~225k (default) | **Jotai ~2x** (string-key or `+ eq`), no leak; mesin ~9x over default |
| 5 | Selector (unrelated change) | **~14M ops/s** (`.select`) / ~1.3M (whole) | ~600k (whole) / ~305k (`selectAtom`) | mesin ~45x over `selectAtom` |
| 6 | Cleanup | frees all 5,000 nodes | retains all 5,000 atoms **and their values** | **mesin auto-GC** (Jotai needs `.remove()`/`setShouldRemove`) |
| 7 | Spreadsheet (2,500 cells, 50 deep) | **~415 ops/s** (grid) / ~387 (formula) | ~199 ops/s (grid) | mesin ~2.1x |

### How to read it

- **1, 2 — mesin is clearly faster.** Its signal graph is lighter for writes and
  deep chains. Note mesin also pays a cost jotai doesn't: every param-less node is
  reached through its factory, which serializes the param (`stringify`) and does a
  `Map` lookup on *every* access — ~50 such calls per op in scenario 2. It wins
  anyway, so these margins are if anything conservative.
- **3 — a near-tie.** 100 consumers want the same derived value. mesin computes it
  once (one cached node, 100 subscribers); jotai's `atomFamily` also computes it
  once (the fair rival). Both do the same work — verified: the derived function
  runs exactly once per update on each. mesin re-runs each effect on every update
  (which re-subscribes), so it used to lose this one; after recent core work it's a
  near-tie that flips run to run within ~10%. The naive jotai pattern — a fresh derived atom
  per consumer (an "atom generator") — recomputes for every consumer and is ~14x
  slower; it's a beginner mistake, not something a jotai user would write.
- **4 — mesin caches by value with no leak *by default*, but jotai can match it.**
  Call a family with a fresh object of the same shape each time. mesin serializes
  the param to a string key, so it's a cache hit and holds one node per shape (8).
  Jotai's **default** `atomFamily` keys by reference: every call **misses**, makes
  a new atom, and **never frees it** — after 100k calls it held **101,000 atoms**.
  But that's a footgun, not "jotai." Serialize the key yourself and use a
  **string-keyed `atomFamily`** — the exact trick mesin uses internally — and jotai
  is O(1), holds 8 atoms (no leak), and is **~2x faster than mesin** here. A custom
  equality (`+ eq`) also works and is comparably fast, though it linear-scans keys
  so its edge shrinks as distinct keys grow. So mesin's real win isn't speed or
  uniqueness: it's that value-keying + bounded memory are the *default*, with
  nothing to remember.
- **5 — mesin's fine-grained `.select` is far cheaper.** Every subscriber (coarse
  and fine, on both libraries) runs the **same** non-trivial payload, so the point
  of fine-grained selection — *skipping* that payload when the watched field didn't
  change — is measured on equal footing. mesin's `.select` checks the slice inline
  in `store.set` and skips the payload, ~14M ops/s. mesin's whole-value subscriber
  can't skip, ~1.3M. Jotai's `selectAtom` also skips the payload, but it's a
  separate derived atom that **recomputes its selector on every change** — that
  fixed overhead costs more than the payload it saves, so here `selectAtom`
  (~305k) is actually **slower than a plain whole-value subscribe** (~600k). mesin
  genuinely does less work for the same result.
- **6 — mesin frees, Jotai retains (both the atom and its value).** After every
  subscriber leaves, re-reading the mesin nodes **recomputes** them (they were
  removed ~1s after the last subscriber). Jotai's `atomFamily` still holds every
  atom **and** its cached value: re-reading is a 0-recompute cache hit and
  `getParams()` still returns all 5,000. Jotai can evict — `.remove(param)` or the
  opt-in `setShouldRemove` predicate (lazy, checked on access) — but it doesn't
  auto-GC on a timer the way mesin does. mesin's automatic cleanup isn't free
  either: it arms a `setTimeout` per node when the last subscriber leaves.
- **7 — mesin is ~2x faster on a realistic spreadsheet.** A 50×50 grid of formula
  cells, 50 levels deep, where editing one input recalculates a growing cone of
  dependent cells. mesin and jotai recompute the **identical** dirty cone (verified
  cell-for-cell); mesin recalcs ~2x faster. mesin's **formula-engine** style — one
  `compute([col, row])` that references itself recursively — is nearly as fast
  (~1.1x) while replacing the whole 2D atom array with a few lines (it pays a
  serialize cost per cell read). A correctness check confirms all three produce
  identical outputs (values are kept in the safe-integer range so the checksum is
  exact).

## Method

- **Metric:** median ops/s over several timed rounds, after a warmup, plus the
  `min..max` of those rounds so you can judge the noise. Median ignores the odd GC
  pause; the spread shows when a median shouldn't be trusted as a precise number
  (mesin's allocation-heavy paths are noisier than jotai's). See [harness.ts](harness.ts).
- **Isolation:** each scenario runs in its own process, so leaks/timers/JIT state
  from one scenario don't skew the next.
- **Fairness:** same work per op on both sides. Where a scenario keeps a value live
  it does so with a real subscriber on both sides (mesin `effect`, jotai
  `store.sub`); where a subscriber runs a payload (scenario 5) both libraries' coarse
  and fine subscribers run the *identical* payload, so the "skip" is measured evenly.
  Scenario 3's jotai callbacks re-read the value to match mesin's effects re-running.
- **Bounded leaks:** scenario 4's default `atomFamily` leaks by design, so its
  iteration count is capped to keep the run from growing without bound.
- **Not measured:** React render behavior, async `query` / async atoms, bundle
  size. These benchmarks are about the sync reactive core only.

> Note: Jotai's family utility comes from the official `jotai-family` package
> (the built-in `jotai/vanilla/utils` `atomFamily` is deprecated). Its behavior is
> the same: keyed by reference, holds every atom until you call `.remove()` (or set
> a `setShouldRemove` predicate).
