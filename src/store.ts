import { MANAGER } from "./manager";
import type { Dependency, Selector, Subscriber } from "./types";
import { identity } from "./utils";

export class Store<T> {
    private value: T;
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
        if (value === this.value) {
            return;
        }
        const update = () => {
            this.value = value;
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
