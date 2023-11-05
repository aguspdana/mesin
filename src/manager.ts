import { Store } from "./store";
import { ComputeFn, Context, NotPromise, Param, UpdateFn } from "./types";

export class Manager {
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

export const MANAGER = new Manager();

export function batch(cb: () => void) {
	MANAGER.batch_update(cb);
}
