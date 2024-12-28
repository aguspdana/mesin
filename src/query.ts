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
            return;
        }
        this.cancel_removal?.();
        this.autoload();
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
        this.param = props.param;
        this.loader = props.loader;
        this.remove_from_registry = props.remove_from_registry;
        this.options = props.options;
        this.schedule_removal(this.options.remove_after);
        this.should_autoload =
            typeof window !== "undefined" || this.options.autoload_on_server;
    }

    get() {
        const state = this.store.get();
        this.autoload();
        return state;
    }

    private autoload() {
        if (
            this.should_autoload &&
            !this.is_loading &&
            !this.cancel_update &&
            this.subscribers_count > 0
        ) {
            this.load();
        }
    }

    async load() {
        this.cancel_update?.();
        this.is_loading = true;
        this.load_id += 1;
        const load_id = this.load_id;

        try {
            const value = await this.loader(this.param);
            if (this.load_id !== load_id) {
                return;
            }
            this.store.set({ status: "finished", value });
        } catch (error) {
            if (this.load_id !== load_id) {
                return;
            }
            this.store.set({ status: "error", error });
        }

        this.is_loading = false;
        this.last_update_ts = Date.now();
        this.schedule_update();
    }

    reset() {
        this.store.set({ status: "pending" });
        this.cancel_update?.();
        this.autoload();
    }

    private schedule_removal(duration = this.options.remove_after) {
        if (this.cancel_removal === null) {
            const cancel = schedule(
                this.remove_from_registry.bind(this),
                duration
            );
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
            this.cancel_update === null
        ) {
            const dt = Date.now() - this.last_update_ts;
            const duration = Math.max(this.options.update_every - dt, 0);
            const cancel = schedule(() => {
                if (this.subscribers_count !== 0) {
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
        this.autoload();
        return value;
    }

    set(value: T): Query<P, T> {
        // Invalidate pending fetch.
        this.load_id += 1;

        this.store.set({ status: "finished", value });

        this.is_loading = false;
        this.last_update_ts = Date.now();
        this.schedule_update();
        return this;
    }
}

export function query<P extends Param, T>(
    loader: (param: P) => Promise<T>,
    options?: Partial<QueryOptions>
) {
    const registry = new Map<string, Query<P, T>>();

    return function (param: P) {
        const key = stringify(param);

        const existing_query = registry.get(key);
        if (existing_query) {
            return existing_query;
        }
        function remove_from_registry() {
            registry.delete(key);
        }
        const new_query = new Query({
            param,
            loader,
            remove_from_registry,
            options: { ...DEFAULT_QUERY_OPTIONS, ...options },
        });
        registry.set(key, new_query);
        return new_query;
    };
}
