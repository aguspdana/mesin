import { MANAGER } from "./manager";
import type { Selector, Subscriber } from "./types";

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
		const context = MANAGER.get_context();
		if (context) {
			const { add_dependency, notify: update } = context;
			const key = Symbol();
			const subscriber = { value, update, selector };
			const unsubscribe = () => {
				this.subscribers.delete(key);
				this.notify_subscribers_count?.(this.subscribers.size);
			}
			const changed = () => {
				return subscriber.selector(this.value) !== subscriber.value;
			}
			add_dependency({
				unsubscribe: unsubscribe,
				changed: changed,
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
		const update = () => {
			this.value = value;
			const notify = () => {
				this.subscribers.forEach((subscriber) => {
					const new_value = subscriber.selector(value);
					if (subscriber.value !== new_value) {
						subscriber.update();
					}
				});
			}
			return notify;
		}
		MANAGER.update_next(this as Store<unknown>, update);
	}
}

export function store<T>(value: T) {
	return new Store(value);
}