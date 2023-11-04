/* eslint-disable no-inner-declarations */
import { useEffect, useRef, useState } from 'react';

export type Param =
	| void
	| null
	| string
	| number
	| boolean
	| Param[]
	| { [key: string]: Param };

export type NotPromise<T> = T extends Promise<unknown> ? never : T;

export type Selector<T, V> = (data: T) => V;

export type ComputeFn<P extends Param, V> = (data: P) => NotPromise<V>;

interface Context {
	add_dependency: (dependency: Dependency) => void;
	update: () => void;
}

interface Subscriber<T, V> {
	update: () => void;
	selector: (value: T) => V;
	value: V;
}

interface Dependency {
	unsubscribe: () => void;
	changed: () => boolean;
}

type NotifyFn = () => void;

type UpdateFn = () => NotifyFn;

export interface QueryPending {
	state: 'pending';
}

export interface QueryError {
	state: 'error';
	error: unknown;
}

export interface QueryFinished<T> {
	state: 'finished';
	value: T;
}

export type QueryState<T> = QueryPending | QueryError | QueryFinished<T>;

export interface QueryOptions {
	/**
	 * Update the store every `n` milliseconds when there's a subscriber.
	 */
	update_every: number;
	/**
	 * Delete the query from the cache after there's no subscriber for `n` milliseconds.
	 * When it's used again it will be in "pending" state.
	 */
	destroy_after: number;
}

class Manager {
	clock = 0;
	contexts: Context[] = [];
	batch: Map<Store<unknown>, UpdateFn> | null = null;

	batch_update(cb: () => void) {
		const parent_batch_exists = !!this.batch;
		if (!parent_batch_exists) {
			this.batch = new Map();
		}
		cb();
		if (!parent_batch_exists) {
			this.run_batch();
		}
	}

	compute<P extends Param, T>(param: P, compute: ComputeFn<P, T>, context: Context): NotPromise<T> {
		this.contexts.push(context as Context);
		const value = compute(param);
		this.contexts.pop();
		this.run_batch();
		return value;
	}

	context() {
		if (this.contexts.length > 0) {
			return this.contexts[this.contexts.length - 1];
		}
		return null;
	}

	/**
	 * Run batch update if there's no context.
	 */
	private run_batch() {
		if (!this.batch || this.contexts.length !== 0) {
			return;
		}
		if (this.batch.size === 0) {
			this.batch = null;
			return;
		}
		this.clock += 1;
		const batch = Array.from(this.batch.values());
		this.batch = null;
		batch.map((update) => update()).forEach((notify) => notify());
	}

	update(store: Store<unknown>, update: UpdateFn) {
		if (this.batch) {
			this.batch.set(store, update);
		} else if (this.contexts.length !== 0) {
			this.batch = new Map();
			this.batch.set(store, update);
		} else {
			this.clock += 1;
			update()();
		}
	}
}

const MANAGER = new Manager();

export function batch(cb: () => void) {
	MANAGER.batch_update(cb);
}

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
		const context = MANAGER.context();
		if (context) {
			const { add_dependency, update } = context;
			const key = Symbol();
			const subscriber = { value, update, selector };
			function unsubscribe(this: Store<T>) {
				this.subscribers.delete(key);
				this.notify_subscribers_count?.(this.subscribers.size);
			}
			function changed(this: Store<T>) {
				return subscriber.selector(this.value) !== subscriber.value;
			}
			add_dependency({
				unsubscribe: unsubscribe.bind(this),
				changed: changed.bind(this),
			});
			this.subscribers.set(key, { value, update, selector });
			this.notify_subscribers_count?.(this.subscribers.size);
		}
		return value;
	}

	set(value: T) {
		if (value === this.value) {
			return;
		}
		function update(this: Store<T>) {
			this.value = value;
			function notify(this: Store<T>) {
				this.subscribers.forEach((subscriber) => {
					const new_value = subscriber.selector(value);
					if (subscriber.value !== new_value) {
						subscriber.update();
					}
				});
			}
			return notify.bind(this);
		}
		MANAGER.update(this as Store<unknown>, update.bind(this));
	}
}

export function store<T>(value: T) {
	return new Store(value);
}

class ComputedImpl<P extends Param, T> {
	private param: P;
	private computeFn: ComputeFn<P, T>;
	private cache: {
		value: T;
		clock: number;
	} | null = null;
	private dependencies: Dependency[] = [];
	private subscribers = new Map<symbol, Subscriber<T, unknown>>();
	private destroy: () => void;
	private destroy_timeout: ReturnType<typeof setTimeout> | null = null;

	constructor(param: P, compute: ComputeFn<P, T>, destroy: () => void) {
		this.param = param;
		this.computeFn = compute;
		this.destroy = destroy;
	}

	private compute() {
		this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
		this.dependencies = [];

		function add_dependency(this: ComputedImpl<P, T>, dependency: Dependency) {
			this.dependencies.push(dependency);
		}

		function update(this: ComputedImpl<P, T>) {
			if (this.cache?.clock !== MANAGER.clock) {
				if (this.subscribers.size === 0) {
					this.cache = null;
				} else {
					this.compute();
				}
			}
		}

		const value = MANAGER.compute(
			this.param,
			this.computeFn,
			{
				add_dependency: add_dependency.bind(this),
				update: update.bind(this),
			},
		);

		this.cache = {
			value,
			clock: MANAGER.clock,
		}

		Array.from(this.subscribers.values()).forEach((s) => {
			const selected = s.selector(value);
			if (s.value !== selected) {
				s.update();
			}
		});

		return this.cache;
	}

	get(): T {
		return this.select((v) => v);
	}

	private get_cache_or_compute() {
		if (this.cache) {
			if (this.cache.clock === MANAGER.clock) {
				return this.cache;
			} else if (!this.dependencies.some(({ changed }) => changed())){
				this.cache.clock = MANAGER.clock;
				return this.cache;
			} else {
				return this.compute();
			}
		} else {
			return this.compute();
		}
	}

	private maybe_destroy() {
		if (this.destroy_timeout !== null) {
			clearTimeout(this.destroy_timeout);
		}

		if (this.subscribers.size !== 0) {
			this.destroy_timeout = null;
			return;
		}

		this.destroy_timeout = setTimeout(() => {
			this.destroy_timeout = null;
			if (this.subscribers.size !== 0) {
				return;
			}
			this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
			this.destroy();
		}, 1000);
	}

	select<V>(selector: Selector<T, V>): V {
		const { value } = this.get_cache_or_compute();
		const selected = selector(value);
		this.subscribe_context(selected, selector);
		this.maybe_destroy();
		return selected;
	}

	/**
	 * Add the context as a subscriber and add the current computed store as a dependency of the context.
	 */
	private subscribe_context<V>(value: V, selector: Selector<T, V>) {
		const context = MANAGER.context();

		if (context) {
			const { add_dependency, update } = context;
			const key = Symbol(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
			const subscriber = { value, update, selector };

			function unsubscribe(this: ComputedImpl<P, T>) {
				this.subscribers.delete(key);
				this.maybe_destroy();
			}

			function changed(this: ComputedImpl<P, T>): boolean {
				const { value } = this.get_cache_or_compute();
				return subscriber.value !== selector(value);
			}

			add_dependency({
				unsubscribe: unsubscribe.bind(this),
				changed: changed.bind(this),
			});

			this.subscribers.set(key, subscriber);
		}
	}
}

class Computed<P extends Param, T> {
	private get_impl: () => ComputedImpl<P, T>;

	constructor(get_impl: () => ComputedImpl<P, T>) {
		this.get_impl = get_impl;
	}

	get(): T {
		return this.get_impl().get();
	}

	select<V>(selector: Selector<T, V>): V {
		return this.get_impl().select(selector);
	}
}

export function compute<P extends Param, T>(cb: (param: P) => NotPromise<T>) {
	const impl_map = new Map<string, ComputedImpl<P, T>>();

	return function(param: P) {
		const key = stringify(param);

		function get_impl() {
			const impl = impl_map.get(key);
			if (impl) {
				return impl;
			}
			function destroy() {
				impl_map.delete(key);
			}
			const new_impl = new ComputedImpl(param, cb, destroy);
			impl_map.set(key, new_impl);
			return new_impl;
		}

		return new Computed(get_impl);
	}
}

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
			} else {
				this.cancel_destroy();
				const isStale = Date.now() - this.last_update > this.options.update_every;
				if (isStale && !this.loading) {
					this.load();
				}
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

class Query<P extends Param, T> {
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

export function effect(cb: () => void) {
	let dependencies: Dependency[] = [];
	let clock = -1;

	function add_dependency(dependency: Dependency) {
		dependencies.push(dependency);
	}

	function update() {
		if (clock === MANAGER.clock) {
			return;
		}
		clock = MANAGER.clock;
		dependencies.forEach(({ unsubscribe }) => unsubscribe());
		dependencies = [];
		const value = MANAGER.compute(
			undefined,
			cb,
			{ add_dependency, update },
		);
		return value;
	}

	function dispose() {
		dependencies.forEach((d) => d.unsubscribe());
	}

	update();

	return dispose;
}

export function useStore<T>(store: Store<NotPromise<T>> | Computed<Param, NotPromise<T>>) {
	const [value, setValue] = useState<NotPromise<T>>(store.get());
	const should_update = useRef(false);

	useEffect(() => {
		should_update.current = false;

		const dispose = effect(() => {
			const newValue = store.get();
			if (should_update.current) {
				setValue(newValue);
			}
		});

		should_update.current = true;

		return () => dispose();
	}, [store])

	return value;
}

/**
 * Create a stable string from `Param`.  The returned string may not be parsed
 * with `JSON.parse()`.
 */
export function stringify(input: Param): string {
	if (input === undefined) {
		return '_';
	}

	if (typeof input !== 'object' || input === null) {
		return JSON.stringify(input);
	}

	if (Array.isArray(input)) {
		const items = input.map((i) => stringify(i));
		return `[${items.join(',')}]`
	}

	const keys = Object.keys(input).sort();
	const props: string[] = [];

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const value = input[key];
		const stable_key = JSON.stringify(key);
		const stable_value = stringify(value);
		if (value !== undefined) {
			const prop = `${stable_key}:${stable_value}`;
			props.push(prop);
		}
	}

	return `{${props.join(',')}}`;
}