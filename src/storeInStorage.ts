import { Store } from "./store";
import { Selector } from "./types";

export class StoreInStorage<T> {
    private store: Store<T>;
    private setToStorage: (value: T) => void;
    private stopListening?: () => void;
    private isListening = false;

    constructor(params: {
        get: () => T;
        set: (value: T) => void;
        listen?: (set: (value: T) => void) => (() => void) | void;
        onSubscriptionChange?: (count: number) => void;
    }) {
        const { get, set, listen, onSubscriptionChange } = params;
        this.setToStorage = set;

        // Create store with enhanced subscription change handler
        this.store = new Store(get(), (count) => {
            onSubscriptionChange?.(count);
            // Clean up listener when no more subscribers
            if (count === 0) {
                if (this.stopListening) {
                    this.stopListening();
                    this.stopListening = undefined;
                    this.isListening = false;
                }
            } else if (!this.isListening) {
                this.isListening = true;
                const result = listen?.((value: T) => this.store.set(value));
                this.stopListening =
                    typeof result === "function" ? result : undefined;
            }
        });
    }

    get(): T {
        return this.store.get();
    }

    select<V>(selector: Selector<T, V>): V {
        return this.store.select(selector);
    }

    set(value: T) {
        this.store.set(value);
        this.setToStorage(value);
    }
}

export const storeInStorage = <T>(params: {
    get: () => T;
    set: (value: T) => void;
    listen?: (set: (value: T) => void) => (() => void) | void;
    onSubscriptionChange?: (count: number) => void;
}) => {
    return new StoreInStorage(params);
};
