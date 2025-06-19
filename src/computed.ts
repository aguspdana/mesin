import { MANAGER } from "./manager";
import { stringify } from "./stringify";
import type {
    ComputeFn,
    Dependency,
    NotPromise,
    Param,
    Selector,
    Subscriber,
} from "./types";
import { schedule } from "./utils";

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
    private subscribers = new Map<symbol, Subscriber<T, unknown>>();
    private removeFromRegistry: () => void;
    private cancelRemoval: (() => void) | null = null;
    private isComputing = false;

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

        const addDependency = (dependency: Dependency) => {
            this.dependencies.push(dependency);
        };

        const notify = () => {
            if (this.cache?.clock === MANAGER.clock) {
                return;
            }
            if (this.subscribers.size === 0) {
                this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
                this.dependencies = [];
                this.cache = null;
            } else {
                this.compute();
            }
        };

        const value = MANAGER.compute(this.param, this.computeFn, {
            addDependency,
            notify,
        });

        this.isComputing = false;

        prevDependencies.forEach(({ unsubscribe }) => unsubscribe());

        this.cache = {
            value,
            clock: MANAGER.clock,
        };

        // Send notification to dependencies's subscribers.
        MANAGER.sendPendingNotifications();

        Array.from(this.subscribers.values()).forEach((s) => {
            const selected = s.selector(value);
            if (s.value !== selected) {
                MANAGER.notifyNext(s.notify);
            }
        });

        return this.cache;
    }

    get(): T {
        return this.select((v) => v);
    }

    private getCacheOrCompute() {
        if (!this.cache) {
            return this.compute();
        } else if (this.cache.clock === MANAGER.clock) {
            return this.cache;
        } else if (!this.dependencies.some(({ changed }) => changed())) {
            this.cache.clock = MANAGER.clock;
            return this.cache;
        }
        return this.compute();
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
            this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
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
            const key = Symbol();
            const subscriber = { value, notify, selector };

            const unsubscribe = () => {
                this.subscribers.delete(key);
                if (this.subscribers.size === 0) {
                    this.dependencies.forEach(({ unsubscribe }) =>
                        unsubscribe()
                    );
                    this.dependencies = [];
                    this.cache = null;
                }
                this.scheduleRemoval();
            };

            const changed = (): boolean => {
                const { value } = this.getCacheOrCompute();
                return subscriber.value !== selector(value);
            };

            addDependency({ unsubscribe, changed });

            this.subscribers.set(key, subscriber);
        }
    }
}

export const compute = <P extends Param, T extends NotPromise<unknown>>(
    cb: (param: P) => T
) => {
    const registry = new Map<string, Computed<P, T>>();

    return (param: P) => {
        const key = stringify(param);
        const existingComputed = registry.get(key);
        if (existingComputed) {
            return existingComputed;
        }
        const removeFromRegistry = () => {
            registry.delete(key);
        };
        const newComputed = new Computed(param, cb, removeFromRegistry);
        registry.set(key, newComputed);
        return newComputed;
    };
};
