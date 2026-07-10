// A tiny, dependency-free micro-benchmark harness.
//
// Why not tinybench/mitata? We need exact control over iteration counts (some
// scenarios leak memory on purpose to expose a flaw), and a stable API. So we
// measure it ourselves: warm up, then take the median ops/sec over N samples.
// Median is used because it ignores the odd GC pause — but we also report the
// min/max of the samples so the reader can see how noisy a number is (mesin's
// allocation-heavy paths are noisier than jotai's, and a lone median hides that).

export interface Opts {
    /** Warmup iterations before measuring. Default 5_000. */
    warmup?: number;
    /** Timed rounds; the median is reported. Default 7. */
    samples?: number;
    /** Iterations per timed round. Default 50_000. */
    iters?: number;
}

export interface Row {
    name: string;
    /** Median operations per second (higher is better). */
    ops: number;
    /** Slowest sampled round (lower bound on ops/s). */
    min: number;
    /** Fastest sampled round (upper bound on ops/s). */
    max: number;
}

const measure = (
    fn: () => void,
    opts: Opts
): { ops: number; min: number; max: number } => {
    const warmup = opts.warmup ?? 5_000;
    const samples = opts.samples ?? 7;
    const iters = opts.iters ?? 50_000;

    for (let i = 0; i < warmup; i++) {
        fn();
    }

    const rounds: number[] = [];
    for (let s = 0; s < samples; s++) {
        const t0 = performance.now();
        for (let i = 0; i < iters; i++) {
            fn();
        }
        const ms = performance.now() - t0;
        rounds.push(iters / (ms / 1_000));
    }
    rounds.sort((a, b) => a - b);
    return {
        ops: rounds[Math.floor(samples / 2)],
        min: rounds[0],
        max: rounds[rounds.length - 1],
    };
};

const fmt = (ops: number): string => {
    if (ops >= 1_000_000) {
        return (ops / 1_000_000).toFixed(2) + "M";
    }
    if (ops >= 1_000) {
        return (ops / 1_000).toFixed(1) + "k";
    }
    return ops.toFixed(0);
};

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

/**
 * Run each named task, print a sorted table, and return the rows.
 */
export const compare = (
    title: string,
    tasks: Record<string, () => void>,
    opts: Opts = {}
): { title: string; rows: Row[] } => {
    console.log(`\n${title}`);
    const rows: Row[] = Object.entries(tasks).map(([name, fn]) => {
        const { ops, min, max } = measure(fn, opts);
        return { name, ops, min, max };
    });
    rows.sort((a, b) => b.ops - a.ops);
    const fastest = rows[0].ops;
    for (const r of rows) {
        const rel =
            r.ops === fastest
                ? "fastest"
                : `${(fastest / r.ops).toFixed(2)}x slower`;
        // Spread shows how much the median can be trusted: a wide min..max means
        // the point estimate is noisy (compare medians, not single winners).
        const spread = `[${fmt(r.min)}..${fmt(r.max)}]`;
        console.log(
            `  ${pad(r.name, 26)} ${pad(fmt(r.ops) + " ops/s", 14)} ${pad(rel, 14)} ${spread}`
        );
    }
    return { title, rows };
};

export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

// A black hole for benchmark results. Assigning a trailing read into an exported,
// module-scoped object keeps V8 from proving the read dead and eliminating it,
// without tripping `noUnusedLocals` (which flags write-only locals).
export const sink: { value: unknown } = { value: undefined };
