import { MANAGER } from "./manager";
import type { Selector, Subscriber } from "./types";

export class Store<T> {
    private value: T;
    private subscribers = new Map<symbol, Subscriber<T, unknown>>();
    private notify_subscribers_count?: (count: number) => void;

    constructor(value: T, notify_subscribers_count?: (count: number) => void) {
        this.value = value;
        this.notify_subscribers_count = notify_subscribers_count;
    }

    get(): T {
        return this.select((v) => v);
    }

    select<V>(selector: Selector<T, V>): V {
        const value = selector(this.value);
        const context = MANAGER.get_context();
        if (context) {
            const { add_dependency, notify } = context;
            const key = Symbol();
            const subscriber = { value, notify, selector };
            const unsubscribe = () => {
                this.subscribers.delete(key);
                this.notify_subscribers_count?.(this.subscribers.size);
            };
            const changed = () =>
                subscriber.selector(this.value) !== subscriber.value;
            add_dependency({ unsubscribe, changed });
            this.subscribers.set(key, subscriber);
            this.notify_subscribers_count?.(this.subscribers.size);
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
                this.subscribers.forEach((subscriber) => {
                    const new_value = subscriber.selector(value);
                    if (subscriber.value !== new_value) {
                        subscriber.notify();
                    }
                });
            };
            return notify;
        };
        MANAGER.update_next(this as Store<unknown>, update);
    }
}

export const store = <T>(value: T) => {
    return new Store(value);
};
