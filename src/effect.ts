import { MANAGER } from "./manager";
import type { Context, Dependency } from "./types";
import { unsubscribeAll } from "./utils";

export const effect = (cb: () => void) => {
    let dependencies: Dependency[] = [];
    let clock = -1;

    const addDependency = (dependency: Dependency) => {
        dependencies.push(dependency);
    };

    const run = () => {
        if (clock === MANAGER.clock) {
            return;
        }
        clock = MANAGER.clock;
        const prevDependencies = dependencies;
        dependencies = [];
        try {
            MANAGER.compute(undefined, cb, context);
        } catch (error) {
            // The callback threw. Roll back to a consistent state so the effect
            // stays reactive: drop the partial new dependencies and keep the
            // previous ones.
            unsubscribeAll(dependencies);
            dependencies = prevDependencies;
            throw error;
        }
        unsubscribeAll(prevDependencies);
        // A computed pull-recomputed inside this effect's context defers
        // notifications to its *other* subscribers (context was non-empty).
        // Computed.compute() only flushes when it is the outermost frame, so
        // when an effect is the outermost frame those notifications would be
        // stranded. Flush them here now that the context stack is empty again.
        MANAGER.sendPendingNotifications();
    };

    // `addDependency` and `run` are stable for the effect's lifetime, so the
    // context object never needs rebuilding on re-run. Declared after `run`
    // because it references it.
    const context: Context = { addDependency, notify: run };

    const dispose = () => {
        unsubscribeAll(dependencies);
    };

    run();

    return dispose;
};
