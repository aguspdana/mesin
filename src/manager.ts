import type { Tracker } from "./reactive";
import { Store } from "./store";
import type { ComputeFn, NotPromise, Param, UpdateFn } from "./types";

export class Manager {
    clock = 0;
    // The context currently being computed, or null at the top level. A single
    // save/restore variable instead of a stack: `currentContext !== null` is
    // exactly "inside some compute", which is all the checks below need.
    private currentContext: Tracker | null = null;
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
        context: Tracker
    ): T {
        const previous = this.currentContext;
        this.currentContext = context;
        const value = compute(param);
        this.currentContext = previous;
        this.maybeRunBatch();
        return value;
    }

    getContext() {
        return this.currentContext;
    }

    /**
     * Call `notify()` after the current context is finished or immediately if there is no context.
     */
    notifyNext(notify: () => void) {
        if (this.currentContext !== null) {
            this.pendingNotifications.push(notify);
        } else {
            notify();
        }
    }

    /**
     * Run batch update if there is no context.
     */
    private maybeRunBatch() {
        if (!this.pendingUpdates || this.currentContext !== null) {
            return;
        }
        if (this.pendingUpdates.size === 0) {
            this.pendingUpdates = null;
            return;
        }
        this.clock += 1;
        const batch = Array.from(this.pendingUpdates.values());
        this.pendingUpdates = null;
        const notifiers = batch.map((update) => update());
        for (let i = 0; i < notifiers.length; i++) {
            notifiers[i]();
        }
    }

    sendPendingNotifications() {
        if (this.currentContext !== null) {
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
        } else if (this.currentContext !== null) {
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
