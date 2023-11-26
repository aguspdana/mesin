import { Store } from "./store";
import type { ComputeFn, Context, NotPromise, Param, UpdateFn } from "./types";

export class Manager {
	clock = 0;
	private contexts: Context[] = [];
	private pending_updates: Map<Store<unknown>, UpdateFn> | null = null;
	private pending_notifications: (() => void)[] = [];

	batch(cb: () => void) {
		const parent_batch_exists = !!this.pending_updates;
		if (!parent_batch_exists) {
			this.pending_updates = new Map();
		}
		cb();
		if (!parent_batch_exists) {
			this.maybe_run_batch();
		}
	}

	compute<P extends Param, T extends NotPromise<unknown>>(param: P, compute: ComputeFn<P, T>, context: Context): T {
		this.contexts.push(context as Context);
		const value = compute(param);
		this.contexts.pop();
		this.maybe_run_batch();
		return value;
	}

	get_context() {
		if (this.contexts.length > 0) {
			return this.contexts[this.contexts.length - 1];
		}
		return null;
	}

	/**
	 * Call `notify()` after the current context is finished or immediately if there's no context.
	 */
	notify_next(notify: () => void) {
		if (this.contexts.length !== 0) {
			this.pending_notifications.push(notify);
		} else {
			notify();
		}
	}

	/**
	 * Run batch update if there's no context.
	 */
	private maybe_run_batch() {
		if (!this.pending_updates || this.contexts.length !== 0) {
			return;
		}
		if (this.pending_updates.size === 0) {
			this.pending_updates = null;
			return;
		}
		this.clock += 1;
		const batch = Array.from(this.pending_updates.values());
		this.pending_updates = null;
		batch.map((update) => update()).forEach((notify) => notify());
	}

	send_pending_notifications() {
		if (this.contexts.length !== 0) {
			return;
		}
		while (this.pending_notifications.length !== 0) {
			this.pending_notifications.pop()?.();
		}
	}

	/**
	 * Update the store after the current cycle is completed.
	 */
	update_next(store: Store<unknown>, update: UpdateFn) {
		if (this.pending_updates) {
			this.pending_updates.set(store, update);
		} else if (this.contexts.length !== 0) {
			this.pending_updates = new Map();
			this.pending_updates.set(store, update);
		} else {
			this.clock += 1;
			update()();
		}
	}
}

export const MANAGER = new Manager();

export function batch(cb: () => void) {
	MANAGER.batch(cb);
}
