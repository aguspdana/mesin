/* eslint-disable no-inner-declarations */
import { useEffect, useRef, useState } from 'react';

export type Param =
	| void
	| string
	| number
	| boolean
	| Param[]
	| { [key: string]: Param };

export type NotPromise<T> = T extends Promise<unknown> ? never : T;

export type Selector<T, V> = (data: T) => V;

export type ComputeFn<P extends Param, V> = (data: P) => NotPromise<V>;

interface Context {
	addDependency: (dependency: Dependency) => void;
	update: () => void;
}

interface Subscriber<T, V> {
	update: () => void;
	selector: (value: T) => V;
	value: V;
}

interface Dependency {
	unsubscribe: () => void;
	hasChanged: () => boolean;
}

type NotifyFn = () => void;

type UpdateFn = () => NotifyFn;

class Manager {
	clock = 0;
	contexts: Context[] = [];
	batch: Map<Signal<unknown>, UpdateFn> | null = null;

	batchUpdate(cb: () => void) {
		const hasParentBatch = !!this.batch;
		if (!hasParentBatch) {
			this.batch = new Map();
		}
		cb();
		if (!hasParentBatch) {
			this.runBatch();
		}
	}

	compute<P extends Param, T>(param: P, compute: ComputeFn<P, T>, context: Context): NotPromise<T> {
		this.contexts.push(context as Context);
		const value = compute(param);
		this.contexts.pop();
		this.runBatch();
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
	private runBatch() {
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
	MANAGER.batchUpdate(cb);
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
			const { addDependency, update } = context;
			const key = Symbol();
			const subscriber = { value, update, selector };
			function unsubscribe(this: Signal<T>) {
				this.subscribers.delete(key);
			}
			function hasChanged(this: Signal<T>) {
				return subscriber.selector(this.value) !== subscriber.value;
			}
			addDependency({
				unsubscribe: unsubscribe.bind(this),
				hasChanged: hasChanged.bind(this),
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
					const newValue = subscriber.selector(value);
					if (subscriber.value !== newValue) {
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

class ComputeImpl<P extends Param, T> {
	private param: P;
	private computeFn: ComputeFn<P, T>;
	private cache: {
		value: T;
		clock: number;
	} | null = null;
	private dependencies: Dependency[] = [];
	private subscribers = new Map<symbol, Subscriber<T, unknown>>();
	private destroy: () => void;
	private destroyTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(param: P, compute: ComputeFn<P, T>, destroy: () => void) {
		this.param = param;
		this.computeFn = compute;
		this.destroy = destroy;
	}

	private compute() {
		this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
		this.dependencies = [];

		function addDependency(this: ComputeImpl<P, T>, dependency: Dependency) {
			this.dependencies.push(dependency);
		}

		function update(this: ComputeImpl<P, T>) {
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
				addDependency: addDependency.bind(this),
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

	private getCacheOrCompute() {
		if (this.cache) {
			if (this.cache.clock === MANAGER.clock) {
				return this.cache;
			} else if (!this.dependencies.some(({ hasChanged }) => hasChanged())){
				this.cache.clock = MANAGER.clock;
				return this.cache;
			} else {
				return this.compute();
			}
		} else {
			return this.compute();
		}
	}

	private maybeDestroy() {
		if (this.destroyTimeout !== null) {
			clearTimeout(this.destroyTimeout);
		}

		if (this.subscribers.size !== 0) {
			this.destroyTimeout = null;
			return;
		}

		this.destroyTimeout = setTimeout(() => {
			this.destroyTimeout = null;
			if (this.subscribers.size !== 0) {
				return;
			}
			this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
			this.destroy();
		}, 1000);
	}

	select<V>(selector: Selector<T, V>): V {
		const { value } = this.getCacheOrCompute();
		const selected = selector(value);
		this.subscribeContext(selected, selector);
		this.maybeDestroy();
		return selected;
	}

	private subscribeContext<V>(value: V, selector: Selector<T, V>) {
		const context = MANAGER.context();

		if (context) {
			const { addDependency, update } = context;
			const key = Symbol(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
			const subscriber = { value, update, selector };

			function unsubscribe(this: ComputeImpl<P, T>) {
				this.subscribers.delete(key);
				this.maybeDestroy();
			}

			function hasChanged(this: ComputeImpl<P, T>): boolean {
				const { value } = this.getCacheOrCompute();
				return subscriber.value !== selector(value);
			}

			addDependency({
				unsubscribe: unsubscribe.bind(this),
				hasChanged: hasChanged.bind(this),
			});

			this.subscribers.set(key, subscriber);
		}
	}
}

class Compute<P extends Param, T> {
	private getImpl: () => ComputeImpl<P, T>;

	constructor(getImpl: () => ComputeImpl<P, T>) {
		this.getImpl = getImpl;
	}

	get(): T {
		return this.getImpl().get();
	}

	select<V>(selector: Selector<T, V>): V {
		return this.getImpl().select(selector);
	}
}

export function compute<P extends Param, T>(cb: (param: P) => NotPromise<T>) {
	const implMap = new Map<string | number | symbol | boolean | undefined, ComputeImpl<P, T>>();

	return function(param: P) {
		// TODO: Use stable stringify.
		const key = typeof param === 'object' && JSON.stringify(param);

		function getImpl() {
			const impl = implMap.get(key);
			if (impl) {
				return impl;
			}
			function destroy() {
				implMap.delete(key);
			}
			const newImpl = new ComputeImpl(param, cb, destroy);
			implMap.set(key, newImpl);
			return newImpl;
		}

		return new Compute(getImpl);
	}
}

export function subscribe<T>(signal: Signal<NotPromise<T>> | Compute<Param, NotPromise<T>>, cb: (value: NotPromise<T>) => void) {
	let dependencies: Dependency[] = [];

	function addDependency(dependency: Dependency) {
		dependencies.push(dependency);
	}

	function update() {
		dependencies.forEach(({ unsubscribe }) => unsubscribe());
		dependencies = [];
		const value = MANAGER.compute(
			undefined,
			() => signal.get(),
			{ addDependency, update },
		);
		cb(value);
		return value;
	}

	function unsubscribe() {
		dependencies.forEach((d) => d.unsubscribe());
	}

	update();

	return unsubscribe;
}

export function useSignal<T>(signal: Signal<NotPromise<T>> | Compute<Param, NotPromise<T>>) {
	const [value, setValue] = useState<NotPromise<T>>(signal.get());
	const shouldUpdateRef = useRef(false);

	useEffect(() => {
		shouldUpdateRef.current = false;

		const unsubscribe = subscribe(signal, (newValue) => {
			if (shouldUpdateRef.current) {
				setValue(newValue);
			}
		});

		shouldUpdateRef.current = true;

		return () => unsubscribe();
	}, [signal])

	return value;
}
