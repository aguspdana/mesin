# mesin — reactive core benchmarks

Small, honest benchmarks putting **mesin** next to **Jotai**, a popular atomic
reactive state library.

Everything is tested through the **vanilla, React-free cores** — mesin's
`store`/`compute`/`effect` and Jotai's `createStore` + `atom` + `atomFamily`
(via the official `jotai-family` package). So the numbers show the reactive
engines, not React.

These benchmarks are not a mesin victory lap. The point is to see honestly where
a signal graph like mesin's is fast, where it isn't, and what its design
actually buys you — and where Jotai's atom model wins, the numbers say so.

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

| # | Scenario | mesin | jotai | Fastest |
|---|----------|-------|-------|---------|
| 1 | Write & propagate | ~2.4M | ~250k | **mesin** (~9x over jotai) |
| 2 | Deep chain (50) | ~90k | ~7.5k | **mesin** (~12x over jotai) |
| 3 | Shared (100) | ~62k | ~35k `atomFamily` / ~3.1k atom-generator | **mesin** (~1.8x over atomFamily) |
| 4 | Object params | ~1.6M | ~4.2M str-key / ~3.9M `+eq` / ~220k default † | **jotai** (hand-keyed, ~2.5x over mesin) |
| 5 | Selector | **~14M** `.select` / ~1.2M whole | ~456k whole / ~237k `selectAtom` | **mesin** (~30x over jotai) |
| 6 | Cleanup | frees all 5,000 | retains all 5,000 | **mesin** (only auto-GC) |
| 7 | Spreadsheet (2,500 cells, 50 deep) | ~440 grid / ~386 formula | ~185 grid | **mesin** (~2.4x over jotai) |

† jotai's **default** `atomFamily` keys by object reference, so every fresh
object misses: it recomputes per call and **leaked 101,000 atoms** over the run.
The `+eq` and string-key variants are bounded (8 atoms, no leak).

### How to read it

- **1, 2 — mesin's signal graph is lighter than jotai's atom machinery.** ~9x
  faster on writes, ~12x on the deep 50-node chain. This is raw engine weight:
  mesin propagates through its dependency graph with less per-node overhead than
  jotai's atom/store bookkeeping.
- **3 — compute-once holds for both honest approaches.** mesin and jotai's
  `atomFamily` both compute the shared value exactly once per update (verified),
  mesin ~1.8x ahead. The naive jotai "atom generator" (a fresh atom per consumer)
  recomputes per consumer and is ~20x slower than mesin — a beginner mistake, not
  something a jotai user would write, shown only as the wrong way to do it.
- **4 — this is jotai's win, with an asterisk.** A hand-keyed `atomFamily` —
  either string-keyed (mesin's own internal strategy) or with a custom equality —
  beats mesin (~4M vs ~1.6M): mesin pays a `stringify` + `Map` lookup on every
  call, and jotai's keyed lookup is cheaper. But that speed only shows up if you
  remember to key it. jotai's **default** `atomFamily` keys by reference, misses
  on every fresh object, and leaked **101,000 atoms**. mesin's advantage here
  isn't peak speed — it's that value-keying + bounded memory are the default,
  with nothing to remember.
- **5 — mesin's fine-grained `.select` is the fastest, and this is its real
  win.** Every subscriber (coarse and fine, both libraries) runs the **same**
  non-trivial payload, so the point of fine-grained selection — *skipping* that
  payload when the watched field didn't change — is measured evenly. mesin checks
  the slice inline in `store.set` with no wrapper node (~14M), far ahead of jotai.
  Notably jotai's `selectAtom` (~237k) is *slower than a plain whole-value
  subscribe* (~456k) — its per-change derived recompute costs more than the
  payload it skips.
- **6 — mesin is the only one that frees automatically.** After every subscriber
  leaves, re-reading the mesin nodes **recomputes** them (freed ~1s after the
  last subscriber). Jotai's `atomFamily` **retains** the atom and its cached
  value (0 recomputes on re-read, all 5,000 still held) until you evict it
  yourself (`.remove()` / `setShouldRemove`). mesin's auto-GC isn't free — it
  arms a `setTimeout` per node when the last subscriber leaves — but it's the
  only library here that needs no manual cleanup.
- **7 — mesin recomputes the same dirty cone as jotai, faster.** Both walk the
  identical grid (cross-checked: outputs agree, checksum 19513600) and recompute
  the same growing cone per edit, mesin ~2.4x faster. mesin's one-`compute`
  "formula" model (addressed by `[col, row]`) is far less code and stays within
  ~1.1x of the hand-built grid, paying a serialize cost per cell read.

### Where mesin actually stands

mesin is **faster than Jotai across most of this suite** — writes, deep chains,
shared computeds, fine-grained store selection, and the spreadsheet recalc. The
one place Jotai wins on raw throughput is **object-param caching** (scenario 4),
where a hand-keyed `atomFamily` beats mesin's stringify-on-every-call — but only
if you key it yourself; Jotai's default `atomFamily` keys by reference and leaks.
mesin's distinguishing features aren't only peak ops/s — they're **automatic
cleanup** (scenario 6, unique here) and **value-keyed families with no leak, by
default** (scenario 4), plus the ergonomics its README argues for (dynamic
dependency graphs, one API for sync + async). Treat these numbers as "is the
engine fast enough and where are its costs," not "which library wins."

## Method

- **Metric:** median ops/s over several timed rounds, after a warmup, plus the
  `min..max` of those rounds so you can judge the noise (mesin's allocation-heavy
  paths, and object-param scenarios generally, are noisier than others). See
  [harness.ts](harness.ts).
- **Isolation:** each scenario runs in its own process, so leaks/timers/JIT state
  from one scenario don't skew the next.
- **Fairness:** same work per op on both sides. Where a scenario keeps a value
  live it does so with a real subscriber on both libraries (mesin `effect`, jotai
  `store.sub`); where a subscriber runs a payload (scenario 5) every library's
  coarse and fine subscribers run the *identical* payload, so the "skip" is
  measured evenly. Scenario 7's three grids are cross-checked for identical
  outputs and provably recompute the same cone.
- **Bounded leaks:** scenario 4's default `atomFamily` leaks by design, so its
  iteration count is capped to keep the run from growing without bound.
- **Not measured:** React render behavior, async `query` / async atoms, bundle
  size. These benchmarks are about the sync reactive core only.

> Note: Jotai's family utility comes from the official `jotai-family` package
> (the built-in `jotai/vanilla/utils` `atomFamily` is deprecated). Its behavior is
> the same: keyed by reference, holds every atom until you call `.remove()` (or set
> a `setShouldRemove` predicate).
