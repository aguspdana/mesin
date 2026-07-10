# mesin — reactive core benchmarks

Small, honest benchmarks putting **mesin** next to two popular reactive state
libraries: **Jotai** and **Preact Signals**.

Everything is tested through the **vanilla, React-free cores** — mesin's
`store`/`compute`/`effect`, Jotai's `createStore` + `atom` + `atomFamily`, and
Preact's `signal`/`computed`/`effect`. So the numbers show the reactive engines,
not React.

These benchmarks are not a mesin victory lap — several of them mesin loses. The
point is to see honestly where a signal graph like mesin's is fast, where it
isn't, and what its design actually buys you.

## Run it

```bash
cd benchmark
npm install   # links the local mesin build via file:..
npm run bench
```

Build mesin first (`npm run build` in the repo root) — the benchmark imports the
shipped `dist`, not the source.

Each scenario runs in its **own child process** (see `run-one.ts`), so one
scenario can't pollute the next one's heap.

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
spread next to each median so you can see how noisy a number is. Compare orders
of magnitude, not single winners.** Higher ops/s is better.

| # | Scenario | mesin | jotai | preact | Fastest |
|---|----------|-------|-------|--------|---------|
| 1 | Write & propagate | ~2.6M | ~305k | ~10.5M | **preact** (~4x over mesin) |
| 2 | Deep chain (50) | ~93k | ~8.7k | ~690k | **preact** (~7x over mesin) |
| 3 | Shared (100) | ~53k | ~51k | ~315k | **preact** (~6x over mesin) |
| 4 | Object params | ~2.0M | ~4.4M `+eq` / ~3.7M str-key / ~225k default | ~17M † | **preact** |
| 5 | Selector | **~15M** `.select` / ~1.3M whole | ~310k `selectAtom` | ~8.5M | **mesin** |
| 6 | Cleanup | frees all 5,000 | retains all 5,000 | retains all 5,000 | **mesin** (only auto-GC) |
| 7 | Spreadsheet (2,500 cells, 50 deep) | ~410 grid / ~378 formula | ~199 grid | ~10.7k grid | **preact** (~26x over mesin) |

† Very noisy (`min..max` spans ~5–21M).

### How to read it

- **Preact Signals is the fastest engine in most scenarios (1, 2, 3, 4, 7).** Its
  lazy, pull-based signal graph is extremely well optimized — on the deep chain
  it's ~7x faster than mesin, on the spreadsheet ~26x (verified: both recompute
  the *identical* 1,274-cell dirty cone per edit, so that gap is real work done
  faster, not less work). If raw core throughput is all you care about, Preact
  wins this suite. mesin's serialization tax (a `stringify`+`Map` lookup per
  param-less node access — ~2,600 per op in the spreadsheet) is a big part of why.
- **3 — compute-once holds for every library here.** mesin, jotai's `atomFamily`,
  and preact all compute the shared value exactly once per update (verified). The
  naive jotai "atom generator" (a fresh atom per consumer) recomputes per consumer
  and is ~15x slower — a beginner mistake, not something a jotai user would write.
- **4 — value-keyed caching is cheap for everyone who does it; mesin's win is that
  it's the default.** Preact (hand-rolled string-key cache), jotai (`+eq` or a
  string-keyed `atomFamily`), and mesin all cache by value and hold 8 nodes. Only
  jotai's **default** `atomFamily` is the footgun: it keys by object reference, so
  every fresh object misses and it leaked **101,000 atoms** over the run. mesin's
  advantage isn't speed here (Preact and jotai+eq are faster) — it's that
  value-keying + bounded memory come for free, with nothing to remember.
- **5 — mesin's fine-grained `.select` is the fastest, and this is its real win.**
  Every subscriber (coarse and fine, all three libraries) runs the **same**
  non-trivial payload, so the point of fine-grained selection — *skipping* that
  payload when the watched field didn't change — is measured evenly. mesin checks
  the slice inline in `store.set` with no wrapper node (~15M), ahead of a Preact
  `computed` (~8.5M). Notably jotai's `selectAtom` (~310k) is *slower than a plain
  whole-value subscribe* — its per-change derived recompute costs more than the
  payload it skips.
- **6 — mesin is the only one that frees automatically.** After every subscriber
  leaves, re-reading the mesin nodes **recomputes** them (freed ~1s after the last
  subscriber). Jotai's `atomFamily` and a Preact computed cache both **retain** the
  node and its cached value (0 recomputes on re-read, all 5,000 still held) until
  you evict them yourself (jotai `.remove()`/`setShouldRemove`; Preact: drop the
  ref). mesin's auto-GC isn't free — it arms a `setTimeout` per node when the last
  subscriber leaves — but it's the only library here that needs no manual cleanup.
- **1, 2 — mesin beats jotai but trails preact.** mesin's signal graph is lighter
  than jotai's atom machinery (~8x on writes, ~11x on the deep chain), but Preact's
  core is lighter still.

### Where mesin actually stands

mesin is **faster than Jotai across the board**, **slower than Preact Signals** in
raw engine throughput (often by a lot), and **fastest of all at fine-grained store
selection** (scenario 5). Its distinguishing features aren't peak ops/s — they're
**automatic cleanup** (scenario 6, unique here) and **value-keyed families with no
leak, by default** (scenario 4), plus the ergonomics its README argues for
(dynamic dependency graphs, one API for sync + async). Treat these numbers as "is
the engine fast enough and where are its costs," not "which library wins."

## Method

- **Metric:** median ops/s over several timed rounds, after a warmup, plus the
  `min..max` of those rounds so you can judge the noise (mesin's allocation-heavy
  paths, and object-param scenarios generally, are noisier than others). See
  [harness.ts](harness.ts).
- **Isolation:** each scenario runs in its own process, so leaks/timers/JIT state
  from one scenario don't skew the next.
- **Fairness:** same work per op on every side. Where a scenario keeps a value live
  it does so with a real subscriber on every library (mesin `effect`, jotai
  `store.sub`, preact `effect`); where a subscriber runs a payload (scenario 5)
  every library's coarse and fine subscribers run the *identical* payload, so the
  "skip" is measured evenly. Scenario 7's grids are cross-checked for identical
  outputs and provably recompute the same cone.
- **Preact has no family primitive**, so scenarios 4 and 6 hand-roll a string-keyed
  cache of computeds — the same serialize-then-`Map` strategy mesin uses internally.
- **Bounded leaks:** scenario 4's default `atomFamily` leaks by design, so its
  iteration count is capped to keep the run from growing without bound.
- **Not measured:** React render behavior, async `query` / async atoms, bundle
  size. These benchmarks are about the sync reactive core only.

> Note: Jotai's family utility comes from the official `jotai-family` package
> (the built-in `jotai/vanilla/utils` `atomFamily` is deprecated). Its behavior is
> the same: keyed by reference, holds every atom until you call `.remove()` (or set
> a `setShouldRemove` predicate).
