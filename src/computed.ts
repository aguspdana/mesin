import { MANAGER } from "./manager";
import { stringify } from "./stringify";
import type {
    ComputeFn,
    Context,
    Dependency,
    NotPromise,
    Param,
    Selector,
    Subscriber,
} from "./types";
import { identity, schedule, unsubscribeAll } from "./utils";

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

export class Computed<P extends Param, T extends NotPromise<unknown>> {
    private param: P;
    private computeFn: ComputeFn<P, T>;
    private cache: {
        value: T;
        clock: number;
    } | null = null;
    private dependencies: Dependency[] = [];
    private subscribers = new Set<Subscriber<T, unknown> & Dependency>();
    private removeFromRegistry: () => void;
    private cancelRemoval: (() => void) | null = null;
    private isComputing = false;
    private addDependency = (dependency: Dependency) => {
        this.dependencies.push(dependency);
    };
    private notify = () => {
        if (this.cache?.clock === MANAGER.clock) {
            return;
        }
        if (this.subscribers.size === 0) {
            unsubscribeAll(this.dependencies);
            this.dependencies = [];
            this.cache = null;
        } else {
            this.compute();
        }
    };
    private context: Context = {
        addDependency: this.addDependency,
        notify: this.notify,
    };

    constructor(
        param: P,
        compute: ComputeFn<P, T>,
        removeFromRegistry: () => void
    ) {
        this.param = param;
        this.computeFn = compute;
        this.removeFromRegistry = removeFromRegistry;
    }

    private compute() {
        const prevDependencies = this.dependencies;
        this.dependencies = [];

        this.isComputing = true;

        const value = MANAGER.compute(
            this.param,
            this.computeFn,
            this.context
        );

        this.isComputing = false;

        unsubscribeAll(prevDependencies);

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
            const selected = subscriber.selector(value);
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
        // Indexed loop instead of `.some(({ changed }) => changed())`: avoids a
        // fresh closure per stale-clock read on the DAG hot path. `changed()`
        // has side effects (it recomputes the dependency), so the short-circuit
        // on the first changed dep must be preserved — `return` does that.
        for (let i = 0; i < this.dependencies.length; i++) {
            if (this.dependencies[i].changed()) {
                return this.compute();
            }
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
            unsubscribeAll(this.dependencies);
            this.dependencies = [];
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
        this.addContextAsSubscriber(selected, selector);
        this.scheduleRemoval();
        return selected;
    }

    /**
     * Add the context as a subscriber and add the current computed store as a dependency of the context.
     */
    private addContextAsSubscriber<V>(value: V, selector: Selector<T, V>) {
        const context = MANAGER.getContext();

        if (context) {
            const { addDependency, notify } = context;

            const subscriber: Subscriber<T, V> & Dependency = {
                value,
                notify,
                selector,
                changed: (): boolean => {
                    const { value } = this.getCacheOrCompute();
                    return subscriber.value !== selector(value);
                },
                unsubscribe: () => {
                    this.subscribers.delete(subscriber);
                    if (this.subscribers.size === 0) {
                        unsubscribeAll(this.dependencies);
                        this.dependencies = [];
                        this.cache = null;
                    }
                    this.scheduleRemoval();
                },
            };

            addDependency(subscriber);

            this.subscribers.add(subscriber);
        }
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
