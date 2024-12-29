import { Store } from "./store";
import { stringify } from "./stringify";
import type { Param, QueryOptions, QueryState, Selector } from "./types";
import { schedule } from "./utils";

const DEFAULT_QUERY_OPTIONS: QueryOptions = {
    update_every: 5 * 60_000,
    remove_after: 5 * 60_000,
    autoload_on_server: false,
};

export class Query<P extends Param, T> {
    private subscribers_count = 0;
    private param: P;
    private loader: (param: P) => Promise<T>;
    private remove_from_registry: () => void;
    private store = new Store<QueryState<T>>({ status: "pending" }, (count) => {
        this.subscribers_count = count;
        if (count === 0) {
            this.schedule_removal();
            this.cancel_update?.();
            return;
        }
        this.cancel_removal?.();
        this.schedule_update();
    });
    private options: QueryOptions;
    private cancel_removal: (() => void) | null = null;
    private cancel_update: (() => void) | null = null;
    private is_loading = false;
    private load_id = 0;
    private should_autoload: boolean;
    private last_update_ts = 0;

    constructor(props: {
        param: P;
        loader: (param: P) => Promise<T>;
        remove_from_registry: () => void;
        options: QueryOptions;
    }) {
        const visibilityChangeHandler = () => {
            if (document.hidden) {
                this.cancel_update?.();
            } else {
                this.schedule_update();
            }
        };
        this.param = props.param;
        this.loader = props.loader;
        this.remove_from_registry = () => {
            props.remove_from_registry();
            if (typeof window !== "undefined") {
                window.removeEventListener(
                    "visibilityChange",
                    visibilityChangeHandler
                );
            }
        };
        this.options = props.options;
        this.schedule_removal(this.options.remove_after);
        this.should_autoload =
            typeof window !== "undefined" || this.options.autoload_on_server;

        if (typeof window !== "undefined") {
            window.addEventListener(
                "visibilityChange",
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
            this.last_update_ts = Date.now();
        }
        return this;
    }

    async load() {
        this.cancel_update?.();
        this.is_loading = true;
        this.load_id += 1;
        const load_id = this.load_id;

        let state: QueryState<T>;
        try {
            const value = await this.loader(this.param);
            if (this.load_id !== load_id) {
                return;
            }
            state = { status: "finished", value };
        } catch (error) {
            if (this.load_id !== load_id) {
                return;
            }
            state = { status: "error", error };
        }

        this.is_loading = false;
        this.last_update_ts = Date.now();
        this.store.set(state);
    }

    reset() {
        this.store.set({ status: "pending" });
        this.cancel_update?.();
        this.last_update_ts = 0;
        if (
            this.should_autoload &&
            !this.is_loading &&
            this.subscribers_count > 0
        ) {
            this.load();
        }
    }

    private schedule_removal(duration = this.options.remove_after) {
        if (this.cancel_removal === null) {
            const cancel = schedule(this.remove_from_registry, duration);
            this.cancel_removal = () => {
                cancel();
                this.cancel_removal = null;
            };
        }
    }

    private schedule_update() {
        if (
            this.should_autoload &&
            this.subscribers_count !== 0 &&
            !this.is_loading &&
            this.cancel_update === null &&
            (typeof window === "undefined" || !document.hidden)
        ) {
            const dt = Date.now() - this.last_update_ts;
            const duration = Math.max(this.options.update_every - dt, 0);
            const cancel = schedule(() => {
                if (this.subscribers_count !== 0 && !this.is_loading) {
                    this.load();
                }
            }, duration);
            this.cancel_update = () => {
                cancel();
                this.cancel_update = null;
            };
        }
    }

    select<V>(selector: Selector<QueryState<T>, V>): V {
        const value = this.store.select(selector);
        return value;
    }

    set(value: T) {
        // Invalidate pending fetch.
        this.load_id += 1;
        this.store.set({ status: "finished", value });
        this.is_loading = false;
        this.last_update_ts = Date.now();
        this.schedule_update();
    }
}

export const query = <P extends Param, T>(
    loader: (param: P) => Promise<T>,
    options?: Partial<QueryOptions>
) => {
    const registry = new Map<string, Query<P, T>>();

    return (param: P) => {
        const key = stringify(param);

        const existing_query = registry.get(key);
        if (existing_query) {
            return existing_query;
        }
        const remove_from_registry = () => {
            registry.delete(key);
        };
        const new_query = new Query({
            param,
            loader,
            remove_from_registry,
            options: { ...DEFAULT_QUERY_OPTIONS, ...options },
        });
        registry.set(key, new_query);
        return new_query;
    };
};
