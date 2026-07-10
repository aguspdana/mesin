// Shared reactive plumbing: a class-based subscriber (one shape, no per-edge
// closures) and a Tracker that reuses subscribers across recomputes.
//
// Before this, every dependency edge read during a (re)compute allocated a fresh
// object literal plus two closures (`changed`, `unsubscribe`) and churned the
// source's subscriber Set (delete old + add new) on every recompute. For a deep
// chain or a spreadsheet that's thousands of allocations and Set operations per
// update. Here a `Subscriber` is a single instance with methods on the prototype,
// and the `Tracker` keeps its dependency list across recomputes: when a compute
// re-reads the same sources in the same order (the common case — a chain always
// reads its one predecessor), the existing subscribers are reused in place, so
// there is zero allocation and zero Set churn for a stable dependency graph.

/**
 * A reactive value that can be depended on: a Store or a Computed. `readForChanged`
 * returns the current value used to test whether a dependent must recompute.
 */
export interface Source {
    readForChanged(): unknown;
    addSubscriber(subscriber: Subscriber): void;
    removeSubscriber(subscriber: Subscriber): void;
}

/**
 * One dependency edge: a dependent (via its Tracker) subscribes to a Source
 * through a selector. Reused across recomputes when the edge is unchanged.
 */
export class Subscriber {
    source: Source;
    // Internal glue — the selector's input type is erased at this layer.
    selector: (value: any) => unknown;
    value: unknown;
    notify: () => void;

    constructor(
        source: Source,
        selector: (value: any) => unknown,
        value: unknown,
        notify: () => void
    ) {
        this.source = source;
        this.selector = selector;
        this.value = value;
        this.notify = notify;
    }

    changed(): boolean {
        return this.selector(this.source.readForChanged()) !== this.value;
    }

    unsubscribe(): void {
        this.source.removeSubscriber(this);
    }
}

const EMPTY: Subscriber[] = [];

/**
 * Owns a dependent's (Computed or effect) dependency list and reuses subscribers
 * across recomputes. Wrap a (re)compute in `begin()` / `end()`; each dependency
 * read calls `track()`.
 */
export class Tracker {
    /** Notification to fire when a dependency changes (the dependent's recompute). */
    notify: () => void;
    /** Current dependency edges, in read order. */
    deps: Subscriber[] = [];
    // Recompute scratch: the previous `deps`, and how far we've reused into it.
    private old: Subscriber[] = EMPTY;
    private cursor = 0;
    private broken = false;

    constructor(notify: () => void) {
        this.notify = notify;
    }

    /** Start a (re)compute: retire the current deps into the reuse pool. */
    begin(): void {
        this.old = this.deps;
        this.deps = [];
        this.cursor = 0;
        this.broken = false;
    }

    /** Finish a (re)compute: drop any old edges that weren't reused. */
    end(): void {
        for (let i = this.cursor; i < this.old.length; i++) {
            this.old[i].unsubscribe();
        }
        this.old = EMPTY;
    }

    /** Record a dependency read, reusing the matching old edge when possible. */
    track(
        source: Source,
        selector: (value: any) => unknown,
        value: unknown
    ): void {
        if (!this.broken) {
            const reused = this.old[this.cursor];
            // Prefix match: the same source in the same slot => reuse in place.
            // It is already in the source's subscriber set, so no Set churn.
            if (reused !== undefined && reused.source === source) {
                reused.selector = selector;
                reused.value = value;
                this.deps.push(reused);
                this.cursor++;
                return;
            }
            // First divergence: stop reusing so the remaining old edges are
            // cleanly retired in end() rather than matched out of order.
            this.broken = true;
        }
        const subscriber = new Subscriber(source, selector, value, this.notify);
        source.addSubscriber(subscriber);
        this.deps.push(subscriber);
    }

    /** True if any current dependency reports a changed value. */
    someChanged(): boolean {
        for (let i = 0; i < this.deps.length; i++) {
            if (this.deps[i].changed()) {
                return true;
            }
        }
        return false;
    }

    /** Tear down every current dependency (dependent disposed / went cold). */
    disposeAll(): void {
        for (let i = 0; i < this.deps.length; i++) {
            this.deps[i].unsubscribe();
        }
        this.deps = [];
    }
}
