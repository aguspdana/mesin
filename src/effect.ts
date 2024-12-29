import { MANAGER } from "./manager";
import type { Dependency } from "./types";

export const effect = (cb: () => void) => {
    let dependencies: Dependency[] = [];
    let clock = -1;

    const add_dependency = (dependency: Dependency) => {
        dependencies.push(dependency);
    };

    const run = () => {
        if (clock === MANAGER.clock) {
            return;
        }
        clock = MANAGER.clock;
        const prev_dependencies = dependencies;
        dependencies = [];
        const value = MANAGER.compute(undefined, cb, {
            add_dependency,
            notify: run,
        });
        prev_dependencies.forEach(({ unsubscribe }) => unsubscribe());
        return value;
    };

    const dispose = () => {
        dependencies.forEach((d) => d.unsubscribe());
    };

    run();

    return dispose;
};
