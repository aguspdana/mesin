import { Store } from "./store";
import { stringify } from "./stringify";
import type { Param, QueryOptions, QueryState, Selector } from "./types";

const DEFAULT_QUERY_OPTIONS: QueryOptions = {
	update_every: 5 * 60_000,
	destroy_after: 5 * 60_000,
};

class QueryImpl<P extends Param, T> {
	private subscribers_count = 0;
	private param: P;
	private loader: (param: P) => Promise<T>;
	private destroy: () => void;
	private store = new Store<QueryState<T>>(
		{ state: 'pending' },
		(count) => {
			this.subscribers_count = count;
			if (count === 0) {
				this.schedule_destroy();
				return;
			}
			this.cancel_destroy();
			const isStale = Date.now() - this.last_update > this.options.update_every;
			if (isStale && !this.loading) {
				this.load();
			}
		}
	);
	private options: QueryOptions;
	private destroy_timeout: ReturnType<typeof setTimeout> | null = null;
	private update_timeout: ReturnType<typeof setTimeout> | null = null;
	private last_update = Date.now();
	private first_load = false;
	private loading = false;
	private load_id = 0;

	constructor(props: {
		param: P,
		loader: (param: P) => Promise<T>,
		destroy: () => void,
		options: QueryOptions,
	}) {
		this.param = props.param;
		this.loader = props.loader;
		this.destroy = props.destroy;
		this.options = props.options;
		this.schedule_destroy(this.options.destroy_after);
	}

	private cancel_destroy() {
		if (this.destroy_timeout !== null) {
			clearTimeout(this.destroy_timeout);
			this.destroy_timeout = null;
		}
	}

	private cancel_update() {
		if (this.update_timeout !== null) {
			clearTimeout(this.update_timeout);
			this.update_timeout = null;
		}
	}

	get() {
		if (!this.first_load) {
			this.load();
		}
		return this.store.get();
	}

	async load() {
		this.first_load = true;
		this.cancel_update();
		this.loading = true;
		this.load_id += 1;
		const load_id = this.load_id;

		try {
			const value = await this.loader(this.param);
			if (this.load_id !== load_id) {
				return;
			}
			this.store.set({ state: 'finished', value });
		} catch (error) {
			if (this.load_id !== load_id) {
				return;
			}
			this.store.set({ state: 'error', error });
		}

		this.loading = false;
		this.last_update = Date.now();
		this.schedule_update();
	}

	private schedule_destroy(duration = this.options.destroy_after) {
		if (this.destroy_timeout === null) {
			this.destroy_timeout = setTimeout(this.destroy.bind(this), duration);
		}
	}

	private schedule_update() {
		if (this.subscribers_count !== 0 && this.update_timeout === null) {
			this.update_timeout = setTimeout(this.load.bind(this), this.options.update_every);
		}
	}

	select<V>(selector: Selector<QueryState<T>, V>): V {
		if (!this.first_load) {
			this.load();
		}
		return this.store.select(selector);
	}

	set(value: T) {
		// Invalidate pending fetch.
		this.load_id += 1;

		this.store.set({ state: 'finished', value });

		this.loading = false;
		this.last_update = Date.now();
		this.schedule_update();
	}
}

export class Query<P extends Param, T> {
	private get_impl: () => QueryImpl<P, T>;

	constructor(get_impl: () => QueryImpl<P, T>) {
		this.get_impl = get_impl;
	}

	get(): QueryState<T> {
		return this.get_impl().get();
	}

	load() {
		this.get_impl().load();
	}

	select<V>(selector: Selector<QueryState<T>, V>): V {
		return this.get_impl().select(selector);
	}

	set(value: T) {
		this.get_impl().set(value);
	}
}

export function query<P extends Param, T>(
	loader: (param: P) => Promise<T>,
	options?: Partial<QueryOptions>
) {
	const impl_map = new Map<string, QueryImpl<P, T>>();

	return function(param: P) {
		const key = stringify(param);

		function get_impl() {
			const existing_query = impl_map.get(key);
			if (existing_query) {
				return existing_query;
			}
			function destroy() {
				impl_map.delete(key);
			}
			const new_query = new QueryImpl({
				param,
				loader,
				destroy,
				options: { ...DEFAULT_QUERY_OPTIONS, ...options },
			});
			impl_map.set(key, new_query);
			return new_query;
		}

		return new Query(get_impl);
	}
}
