import { Dependency } from "./types";

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
