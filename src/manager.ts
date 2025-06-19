import { Store } from "./store";
import type { ComputeFn, Context, NotPromise, Param, UpdateFn } from "./types";

export class Manager {
    clock = 0;
    private contexts: Context[] = [];
    private pendingUpdates: Map<Store<unknown>, UpdateFn> | null = null;
    private pendingNotifications: (() => void)[] = [];

    batch(cb: () => void) {
        const parentBatchExists = !!this.pendingUpdates;
        if (!parentBatchExists) {
            this.pendingUpdates = new Map();
        }
        cb();
        if (!parentBatchExists) {
            this.maybeRunBatch();
        }
    }

    compute<P extends Param, T extends NotPromise<unknown>>(
        param: P,
        compute: ComputeFn<P, T>,
        context: Context
    ): T {
        this.contexts.push(context as Context);
        const value = compute(param);
        this.contexts.pop();
        this.maybeRunBatch();
        return value;
    }

    getContext() {
        if (this.contexts.length > 0) {
            return this.contexts[this.contexts.length - 1];
        }
        return null;
    }

    /**
     * Call `notify()` after the current context is finished or immediately if there is no context.
     */
    notifyNext(notify: () => void) {
        if (this.contexts.length !== 0) {
            this.pendingNotifications.push(notify);
        } else {
            notify();
        }
    }

    /**
     * Run batch update if there is no context.
     */
    private maybeRunBatch() {
        if (!this.pendingUpdates || this.contexts.length !== 0) {
            return;
        }
        if (this.pendingUpdates.size === 0) {
            this.pendingUpdates = null;
            return;
        }
        this.clock += 1;
        const batch = Array.from(this.pendingUpdates.values());
        this.pendingUpdates = null;
        batch.map((update) => update()).forEach((notify) => notify());
    }

    sendPendingNotifications() {
        if (this.contexts.length !== 0) {
            return;
        }
        while (this.pendingNotifications.length !== 0) {
            this.pendingNotifications.pop()?.();
        }
    }

    /**
     * Update the store after the current cycle is completed.
     */
    updateNext(store: Store<unknown>, update: UpdateFn) {
        if (this.pendingUpdates) {
            this.pendingUpdates.set(store, update);
        } else if (this.contexts.length !== 0) {
            this.pendingUpdates = new Map();
            this.pendingUpdates.set(store, update);
        } else {
            this.clock += 1;
            update()();
        }
    }
}

export const MANAGER = new Manager();

export const batch = (cb: () => void) => {
    MANAGER.batch(cb);
};
