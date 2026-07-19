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
        const value = MANAGER.compute(undefined, cb, context);
        unsubscribeAll(prevDependencies);
        // A computed pull-recomputed inside this effect's context defers
        // notifications to its *other* subscribers (context was non-empty).
        // Computed.compute() only flushes when it is the outermost frame, so
        // when an effect is the outermost frame those notifications would be
        // stranded. Flush them here now that the context stack is empty again.
        MANAGER.sendPendingNotifications();
        return value;
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
