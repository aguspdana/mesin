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
import { schedule } from "./utils";

/**
 * Remove the computed store from the registry after it has no subscriber for DESTROY_AFTER milliseconds.
 */
const REMOVE_FROM_REGISTRY_AFTER = 1000; // milliseconds

class CircularDependencyError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = "CircularDependencyError";
	}
}

export class Computed<P extends Param, T extends NotPromise<unknown>> {
	private param: P;
	private computeFn: ComputeFn<P, T>;
	private cache: {
		value: T;
		clock: number;
	} | null = null;
	private dependencies: Dependency[] = [];
	private subscribers = new Map<symbol, Subscriber<T, unknown>>();
	private remove_from_registry: () => void;
	private cancel_removal: (() => void) | null = null;
	private is_computing = false;

	constructor(param: P, compute: ComputeFn<P, T>, remove_from_registry: () => void) {
		this.param = param;
		this.computeFn = compute;
		this.remove_from_registry = remove_from_registry;
	}

	private compute() {
		this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
		this.dependencies = [];

		const add_dependency = (dependency: Dependency) => {
			this.dependencies.push(dependency);
		}

		const notify = () => {
			if (this.cache?.clock === MANAGER.clock) {
				return;
			}
			if (this.subscribers.size === 0) {
				this.cache = null;
			} else {
				this.compute();
			}
		}

		this.is_computing = true;
		const value = MANAGER.compute(
			this.param,
			this.computeFn,
			{
				add_dependency,
				notify,
			},
		);
		this.is_computing = false;

		this.cache = {
			value,
			clock: MANAGER.clock,
		}

		MANAGER.send_pending_notifications();
		Array.from(this.subscribers.values()).forEach((s) => {
			const selected = s.selector(value);
			if (s.value !== selected) {
				MANAGER.notify_next(s.update);
			}
		});

		return this.cache;
	}

	get(): T {
		return this.select((v) => v);
	}

	private get_cache_or_compute() {
		if (!this.cache) {
			return this.compute();
		} else if (this.cache.clock === MANAGER.clock) {
			return this.cache;
		} else if (!this.dependencies.some(({ changed }) => changed())){
			this.cache.clock = MANAGER.clock;
			return this.cache;
		}
		return this.compute();
	}

	private maybe_destroy() {
		this.cancel_removal?.();

		if (this.subscribers.size !== 0) {
			this.cancel_removal = null;
			return;
		}

		this.cancel_removal = schedule(() => {
			this.cancel_removal = null;
			if (this.subscribers.size !== 0) {
				return;
			}
			this.dependencies.forEach(({ unsubscribe }) => unsubscribe());
			this.remove_from_registry();
		}, REMOVE_FROM_REGISTRY_AFTER);
	}

	select<V>(selector: Selector<T, V>): V {
		if (this.is_computing) {
			throw new CircularDependencyError('Circular dependency detected');
		}
		const { value } = this.get_cache_or_compute();
		const selected = selector(value);
		this.add_context_as_subscriber(selected, selector);
		this.maybe_destroy();
		return selected;
	}

	/**
	 * Add the context as a subscriber and add the current computed store as a dependency of the context.
	 */
	private add_context_as_subscriber<V>(value: V, selector: Selector<T, V>) {
		const context = MANAGER.get_context();

		if (context) {
			const { add_dependency, notify: update } = context;
			const key = Symbol();
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

export function compute<P extends Param, T extends NotPromise<unknown>>(cb: (param: P) => T) {
	const registry = new Map<string, Computed<P, T>>();

	return function(param: P) {
		const key = stringify(param);
		const impl = registry.get(key);
		if (impl) {
			return impl;
		}
		function remove_from_registry() {
			registry.delete(key);
		}
		const new_impl = new Computed(param, cb, remove_from_registry);
		registry.set(key, new_impl);
		return new_impl;
	}
}
