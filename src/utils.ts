import { Dependency } from "./types";

/**
 * Shared identity selector. `get()` is `select(identity)`; reusing one function
 * avoids allocating a fresh `(v) => v` closure on every read.
 */
export const identity = <T>(value: T): T => value;

export const schedule = (cb: () => void, duration: number) => {
    const timeout = setTimeout(cb, duration);
    return () => clearTimeout(timeout);
};

export const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export const unsubscribeAll = (dependencies: Dependency[]) => {
    for (let i = 0; i < dependencies.length; i++) {
        dependencies[i].unsubscribe();
    }
};
