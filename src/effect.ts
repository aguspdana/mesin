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
