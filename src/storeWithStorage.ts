// TODO: Do not listen to the storage if the store is not subscribed
import { Store } from "./store";
import { Selector } from "./types";

export class StoreWithStorage<T> {
    private store: Store<T>;
    private setToStorage: (value: T) => void;

    constructor(params: {
        get: () => T;
        set: (value: T) => void;
        listen?: (set: (value: T) => void) => void;
        notify_subscribers_count?: (count: number) => void;
    }) {
        const { get, set, listen, notify_subscribers_count } = params;
        this.setToStorage = set;
        this.store = new Store(get(), notify_subscribers_count);
        listen?.((value: T) => this.store.set(value));
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
