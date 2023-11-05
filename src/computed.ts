import { MANAGER } from "./manager";
import { stringify } from "./stringify";
import type {
	ComputeFn,
	Dependency,
	NotPromise,
	Param,
	Selector,
	Subscriber
} from "./types";

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
	private computing = false;

	constructor(param: P, compute: ComputeFn<P, T>, destroy: () => void) {
		this.param = param;
		this.computeFn = compute;
		this.destroy = destroy;
	}

	private compute() {
		this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
		this.dependencies = [];

		const add_dependency = (dependency: Dependency) => {
			this.dependencies.push(dependency);
		}

		const update = () => {
			if (this.cache?.clock !== MANAGER.clock) {
				if (this.subscribers.size === 0) {
					this.cache = null;
				} else {
					this.compute();
				}
			}
		}

		this.computing = true;
		const value = MANAGER.compute(
			this.param,
			this.computeFn,
			{
				add_dependency: add_dependency,
				update: update,
			},
		);
		this.computing = false;

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
		if (this.computing) {
			throw new Error('Circular dependency detected');
		}
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

			const unsubscribe = () => {
				this.subscribers.delete(key);
				this.maybe_destroy();
			}

			const changed = (): boolean => {
				const { value } = this.get_cache_or_compute();
				return subscriber.value !== selector(value);
			}

			add_dependency({
				unsubscribe: unsubscribe,
				changed: changed,
			});

			this.subscribers.set(key, subscriber);
		}
	}
}

export class Computed<P extends Param, T> {
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
