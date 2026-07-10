import { MANAGER } from "./manager";
import { Subscriber, Tracker } from "./reactive";
import type { Source } from "./reactive";
import { stringify } from "./stringify";
import type { ComputeFn, NotPromise, Param, Selector } from "./types";
import { identity, schedule } from "./utils";

/**
 * Remove the computed store from the registry after it has no subscriber for DESTROY_AFTER milliseconds.
 */
export const REMOVE_FROM_REGISTRY_AFTER = 1000; // milliseconds

export class CircularDependencyError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = "CircularDependencyError";
    }
}

export class Computed<P extends Param, T extends NotPromise<unknown>>
    implements Source
{
    private param: P;
    private computeFn: ComputeFn<P, T>;
    private cache: {
        value: T;
        clock: number;
    } | null = null;
    // Its own dependencies (what this computed reads), reused across recomputes.
    private tracker: Tracker;
    // Its dependents (who reads this computed).
    private subscribers = new Set<Subscriber>();
    private removeFromRegistry: () => void;
    private cancelRemoval: (() => void) | null = null;
    private isComputing = false;
    private notify = () => {
        if (this.cache?.clock === MANAGER.clock) {
            return;
        }
        if (this.subscribers.size === 0) {
            this.tracker.disposeAll();
            this.cache = null;
        } else {
            this.compute();
        }
    };

    constructor(
        param: P,
        compute: ComputeFn<P, T>,
        removeFromRegistry: () => void
    ) {
        this.param = param;
        this.computeFn = compute;
        this.removeFromRegistry = removeFromRegistry;
        this.tracker = new Tracker(this.notify);
    }

    private compute() {
        this.tracker.begin();

        this.isComputing = true;

        const value = MANAGER.compute(
            this.param,
            this.computeFn,
            this.tracker
        );

        this.isComputing = false;

        this.tracker.end();

        // Reuse the cache object rather than allocating a new one per recompute.
        // `getCacheOrCompute` already mutates `cache.clock` in place, so callers
        // never retain a cache reference across a recompute.
        if (this.cache) {
            this.cache.value = value;
            this.cache.clock = MANAGER.clock;
        } else {
            this.cache = {
                value,
                clock: MANAGER.clock,
            };
        }

        // Send notification to dependencies's subscribers.
        MANAGER.sendPendingNotifications();

        for (const subscriber of this.subscribers) {
            const selected =
                subscriber.selector === identity
                    ? value
                    : subscriber.selector(value);
            if (subscriber.value !== selected) {
                MANAGER.notifyNext(subscriber.notify);
            }
        }

        return this.cache;
    }

    get(): T {
        return this.select(identity);
    }

    private getCacheOrCompute() {
        if (!this.cache) {
            return this.compute();
        }
        if (this.cache.clock === MANAGER.clock) {
            return this.cache;
        }
        // `someChanged()` recomputes stale dependencies as a side effect and
        // short-circuits on the first changed one, so a recompute is triggered
        // only when a dependency's value actually differs.
        if (this.tracker.someChanged()) {
            return this.compute();
        }
        this.cache.clock = MANAGER.clock;
        return this.cache;
    }

    private scheduleRemoval() {
        this.cancelRemoval?.();

        if (this.subscribers.size !== 0) {
            this.cancelRemoval = null;
            return;
        }

        const cancelRemoval = schedule(() => {
            this.cancelRemoval = null;
            if (this.subscribers.size !== 0) {
                return;
            }
            this.tracker.disposeAll();
            this.cache = null;
            this.removeFromRegistry();
        }, REMOVE_FROM_REGISTRY_AFTER);

        this.cancelRemoval = () => {
            cancelRemoval();
            this.cancelRemoval = null;
        };
    }

    select<V>(selector: Selector<T, V>): V {
        if (this.isComputing) {
            throw new CircularDependencyError("Circular dependency detected");
        }
        const { value } = this.getCacheOrCompute();
        const selected = selector(value);
        const context = MANAGER.getContext();
        if (context) {
            context.track(this, selector, selected);
        }
        this.scheduleRemoval();
        return selected;
    }

    // --- Source ---

    readForChanged(): unknown {
        return this.getCacheOrCompute().value;
    }

    addSubscriber(subscriber: Subscriber): void {
        this.subscribers.add(subscriber);
    }

    removeSubscriber(subscriber: Subscriber): void {
        this.subscribers.delete(subscriber);
        if (this.subscribers.size === 0) {
            this.tracker.disposeAll();
            this.cache = null;
        }
        this.scheduleRemoval();
    }
}

export const compute = <P extends Param, T extends NotPromise<unknown>>(
    cb: (param: P) => T
) => {
    const registry = new Map<string, Computed<P, T>>();

    // One-entry memo of the last resolution. Repeated access with the same param
    // *identity* — param-less singletons (`node()`), constant params (`node(7)`) —
    // is the hot path (a chain or grid re-reads the same node thousands of times
    // per recompute), and it lets us skip `stringify` + the `Map` lookup entirely.
    // Object params are fresh references each call, so they never hit this and
    // correctly fall through to content-based keying below.
    let lastParam: P;
    let lastComputed: Computed<P, T> | null = null;

    return (param: P) => {
        if (lastComputed !== null && param === lastParam) {
            return lastComputed;
        }
        const key = stringify(param);
        const existingComputed = registry.get(key);
        if (existingComputed) {
            lastParam = param;
            lastComputed = existingComputed;
            return existingComputed;
        }
        let newComputed: Computed<P, T>;
        const removeFromRegistry = () => {
            registry.delete(key);
            // Drop the memo if it points at the node being auto-removed, so the
            // next access re-creates it instead of handing back a dead node.
            if (lastComputed === newComputed) {
                lastComputed = null;
            }
        };
        newComputed = new Computed(param, cb, removeFromRegistry);
        registry.set(key, newComputed);
        lastParam = param;
        lastComputed = newComputed;
        return newComputed;
    };
};
