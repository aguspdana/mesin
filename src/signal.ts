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

class Manager {
	clock = 0;
	contexts: Context[] = [];
	batch: Map<Signal<unknown>, UpdateFn> | null = null;

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

	update(signal: Signal<unknown>, update: UpdateFn) {
		if (this.batch) {
			this.batch.set(signal, update);
		} else if (this.contexts.length !== 0) {
			this.batch = new Map();
			this.batch.set(signal, update);
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

export class Signal<T> {
	private value: T;
	private subscribers = new Map<symbol, Subscriber<T, unknown>>();

	constructor(value: T) {
		this.value = value;
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
			function unsubscribe(this: Signal<T>) {
				this.subscribers.delete(key);
			}
			function changed(this: Signal<T>) {
				return subscriber.selector(this.value) !== subscriber.value;
			}
			add_dependency({
				unsubscribe: unsubscribe.bind(this),
				changed: changed.bind(this),
			});
			this.subscribers.set(key, { value, update, selector });
		}
		return value;
	}

	set(value: T) {
		if (value === this.value) {
			return;
		}
		function update(this: Signal<T>) {
			this.value = value;
			function notify(this: Signal<T>) {
				this.subscribers.forEach((subscriber) => {
					const new_value = subscriber.selector(value);
					if (subscriber.value !== new_value) {
						subscriber.update();
					}
				});
			}
			return notify.bind(this);
		}
		MANAGER.update(this as Signal<unknown>, update.bind(this));
	}
}

export function signal<T>(value: T) {
	return new Signal(value);
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
	 * Add the context as a subscriber and add the current signal as a dependency of the context.
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
	const impl_map = new Map<string | number | symbol | boolean | undefined, ComputedImpl<P, T>>();

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

export function useSignal<T>(signal: Signal<NotPromise<T>> | Computed<Param, NotPromise<T>>) {
	const [value, setValue] = useState<NotPromise<T>>(signal.get());
	const should_update = useRef(false);

	useEffect(() => {
		should_update.current = false;

		const dispose = effect(() => {
			const newValue = signal.get();
			if (should_update.current) {
				setValue(newValue);
			}
		});

		should_update.current = true;

		return () => dispose();
	}, [signal])

	return value;
}

/**
 * Create a stable string from `Param`. Returns `undefined` if input is `undefined`.
 * The returned string may not be parsed with `JSON.parse()` because `undefined` in
 * an array is serialized into an empty string.  If an array has only one item
 * that is `undefined`, it is serialized into an empty array.
 */
export function stringify(input: Param): string | undefined {
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
		if (value !== undefined) {
			const prop = `"${key}":${stringify(value)}`;
			props.push(prop);
		}
	}

	return `{${props.join(',')}}`;
}
