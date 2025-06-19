import { Store } from "./store";
import { stringify } from "./stringify";
import type { Param, QueryOptions, QueryState, Selector } from "./types";
import { schedule } from "./utils";

const DEFAULT_QUERY_OPTIONS: QueryOptions = {
    updateEvery: 5 * 60_000,
    removeAfter: 5 * 60_000,
    autoloadOnServer: false,
};

export class Query<P extends Param, T> {
    private subscribersCount = 0;
    private param: P;
    private loader: (param: P) => Promise<T>;
    private removeFromRegistry: () => void;
    private store = new Store<QueryState<T>>({ status: "pending" }, (count) => {
        this.subscribersCount = count;
        if (count === 0) {
            this.scheduleRemoval();
            this.cancelUpdate?.();
            return;
        }
        this.cancelRemoval?.();
        this.scheduleUpdate();
    });
    private options: QueryOptions;
    private cancelRemoval: (() => void) | null = null;
    private cancelUpdate: (() => void) | null = null;
    private isLoading = false;
    private loadId = 0;
    private shouldAutoload: boolean;
    private lastUpdateTs = 0;

    constructor(props: {
        param: P;
        loader: (param: P) => Promise<T>;
        removeFromRegistry: () => void;
        options: QueryOptions;
    }) {
        const visibilityChangeHandler = () => {
            if (document.hidden) {
                this.cancelUpdate?.();
            } else {
                this.scheduleUpdate();
            }
        };
        this.param = props.param;
        this.loader = props.loader;
        this.removeFromRegistry = () => {
            props.removeFromRegistry();
            if (typeof window !== "undefined") {
                window.removeEventListener(
                    "visibilitychange",
                    visibilityChangeHandler
                );
            }
        };
        this.options = props.options;
        this.scheduleRemoval(this.options.removeAfter);
        this.shouldAutoload =
            typeof window !== "undefined" || this.options.autoloadOnServer;

        if (typeof window !== "undefined") {
            window.addEventListener(
                "visibilitychange",
                visibilityChangeHandler
            );
        }
    }

    get() {
        const state = this.store.get();
        return state;
    }

    init(value: T): Query<P, T> {
        if (this.store.get().status === "pending") {
            this.store.set({ status: "finished", value });
            this.lastUpdateTs = Date.now();
        }
        return this;
    }

    async load() {
        this.cancelUpdate?.();
        this.isLoading = true;
        this.loadId += 1;
        const loadId = this.loadId;

        let state: QueryState<T>;
        try {
            const value = await this.loader(this.param);
            if (this.loadId !== loadId) {
                return;
            }
            state = { status: "finished", value };
        } catch (error) {
            if (this.loadId !== loadId) {
                return;
            }
            state = { status: "error", error };
        }

        this.isLoading = false;
        this.lastUpdateTs = Date.now();
        this.store.set(state);
    }

    reset() {
        this.store.set({ status: "pending" });
        this.cancelUpdate?.();
        this.lastUpdateTs = 0;
        if (
            this.shouldAutoload &&
            !this.isLoading &&
            this.subscribersCount > 0
        ) {
            this.load();
        }
    }

    private scheduleRemoval(duration = this.options.removeAfter) {
        if (this.cancelRemoval === null) {
            const cancel = schedule(this.removeFromRegistry, duration);
            this.cancelRemoval = () => {
                cancel();
                this.cancelRemoval = null;
            };
        }
    }

    private scheduleUpdate() {
        if (
            this.shouldAutoload &&
            this.subscribersCount !== 0 &&
            !this.isLoading &&
            this.cancelUpdate === null &&
            (typeof window === "undefined" || !document.hidden)
        ) {
            const dt = Date.now() - this.lastUpdateTs;
            const duration = Math.max(this.options.updateEvery - dt, 0);
            const cancel = schedule(() => {
                if (this.subscribersCount !== 0 && !this.isLoading) {
                    this.load();
                }
            }, duration);
            this.cancelUpdate = () => {
                cancel();
                this.cancelUpdate = null;
            };
        }
    }

    select<V>(selector: Selector<QueryState<T>, V>): V {
        const value = this.store.select(selector);
        return value;
    }

    set(value: T) {
        // Invalidate pending fetch.
        this.loadId += 1;
        this.store.set({ status: "finished", value });
        this.isLoading = false;
        this.lastUpdateTs = Date.now();
        this.scheduleUpdate();
    }
}

export const query = <P extends Param, T>(
    loader: (param: P) => Promise<T>,
    options?: Partial<QueryOptions>
) => {
    const registry = new Map<string, Query<P, T>>();

    return (param: P) => {
        const key = stringify(param);

        const existingQuery = registry.get(key);
        if (existingQuery) {
            return existingQuery;
        }
        const removeFromRegistry = () => {
            registry.delete(key);
        };
        const newQuery = new Query({
            param,
            loader,
            removeFromRegistry,
            options: { ...DEFAULT_QUERY_OPTIONS, ...options },
        });
        registry.set(key, newQuery);
        return newQuery;
    };
};
