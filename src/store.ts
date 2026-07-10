import { MANAGER } from "./manager";
import type { Source, Subscriber } from "./reactive";
import type { Selector } from "./types";
import { identity } from "./utils";

export class Store<T> implements Source {
    private value: T;
    private subscribers = new Set<Subscriber>();
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
            context.track(this, selector, value);
        }
        return value;
    }

    // --- Source ---

    readForChanged(): unknown {
        return this.value;
    }

    addSubscriber(subscriber: Subscriber): void {
        this.subscribers.add(subscriber);
        this.onSubscriptionChange?.(this.subscribers.size);
    }

    removeSubscriber(subscriber: Subscriber): void {
        this.subscribers.delete(subscriber);
        this.onSubscriptionChange?.(this.subscribers.size);
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
