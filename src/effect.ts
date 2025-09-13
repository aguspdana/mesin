import { MANAGER } from "./manager";
import type { Dependency } from "./types";
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
        const value = MANAGER.compute(undefined, cb, {
            addDependency,
            notify: run,
        });
        unsubscribeAll(prevDependencies);
        return value;
    };

    const dispose = () => {
        unsubscribeAll(dependencies);
    };

    run();

    return dispose;
};
