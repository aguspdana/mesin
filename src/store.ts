import { MANAGER } from "./manager";
import type { Dependency, Selector, Subscriber } from "./types";
import { identity } from "./utils";

export class Store<T> {
    private value: T;
    // The value of a not-yet-committed write, while one is queued in the
    // manager's batch. `null` means no write is pending. Wrapped in an object
    // so a pending `undefined` value is still distinguishable from "no pending".
    private pending: { value: T } | null = null;
    private subscribers = new Set<Subscriber<T, unknown> & Dependency>();
    private onSubscriptionChange?: (count: number) => void;

    constructor(value: T, onSubscriptionChange?: (count: number) => void) {
        this.value = value;
        this.onSubscriptionChange = onSubscriptionChange;
    }

    get(): T {
        return this.select(identity);
    }

    select<V>(selector: Selector<T, V>): V {
        const value = selector(this.value);
        const context = MANAGER.getContext();
        if (context) {
            const { addDependency, notify } = context;
            const subscriber: Subscriber<T, V> & Dependency = {
                value,
                notify,
                selector,
                changed: () =>
                    subscriber.selector(this.value) !== subscriber.value,
                unsubscribe: () => {
                    this.subscribers.delete(subscriber);
                    this.onSubscriptionChange?.(this.subscribers.size);
                },
            };
            addDependency(subscriber);
            this.subscribers.add(subscriber);
            this.onSubscriptionChange?.(this.subscribers.size);
        }
        return value;
    }

    set(value: T) {
        // Compare against the latest *intended* value: the pending write if one
        // is queued, otherwise the committed value. Comparing against the
        // committed value alone would let a write that reverts a queued write
        // back to the committed value be dropped, keeping the stale queued write
        // (`batch(() => { s.set(1); s.set(0); })` must end at 0).
        const latest = this.pending ? this.pending.value : this.value;
        if (value === latest) {
            return;
        }
        this.pending = { value };
        const update = () => {
            this.value = value;
            this.pending = null;
            const notify = () => {
                for (const subscriber of this.subscribers) {
                    const newValue = subscriber.selector(value);
                    if (subscriber.value !== newValue) {
                        subscriber.notify();
                    }
                }
            };
            return notify;
        };
        MANAGER.updateNext(this as Store<unknown>, update);
    }
}

export const store = <T>(value: T) => {
    return new Store(value);
};
