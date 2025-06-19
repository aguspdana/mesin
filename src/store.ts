import { MANAGER } from "./manager";
import type { Selector, Subscriber } from "./types";

export class Store<T> {
    private value: T;
    private subscribers = new Map<symbol, Subscriber<T, unknown>>();
    private notifySubscribersCount?: (count: number) => void;

    constructor(value: T, notifySubscribersCount?: (count: number) => void) {
        this.value = value;
        this.notifySubscribersCount = notifySubscribersCount;
    }

    get(): T {
        return this.select((v) => v);
    }

    select<V>(selector: Selector<T, V>): V {
        const value = selector(this.value);
        const context = MANAGER.getContext();
        if (context) {
            const { addDependency, notify } = context;
            const key = Symbol();
            const subscriber = { value, notify, selector };
            const unsubscribe = () => {
                this.subscribers.delete(key);
                this.notifySubscribersCount?.(this.subscribers.size);
            };
            const changed = () =>
                subscriber.selector(this.value) !== subscriber.value;
            addDependency({ unsubscribe, changed });
            this.subscribers.set(key, subscriber);
            this.notifySubscribersCount?.(this.subscribers.size);
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
                    const newValue = subscriber.selector(value);
                    if (subscriber.value !== newValue) {
                        subscriber.notify();
                    }
                });
            };
            return notify;
        };
        MANAGER.updateNext(this as Store<unknown>, update);
    }
}

export const store = <T>(value: T) => {
    return new Store(value);
};
