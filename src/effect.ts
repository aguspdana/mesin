import { MANAGER } from "./manager";
import { Tracker } from "./reactive";

export const effect = (cb: () => void) => {
    let clock = -1;

    const run = () => {
        if (clock === MANAGER.clock) {
            return;
        }
        clock = MANAGER.clock;
        tracker.begin();
        const value = MANAGER.compute(undefined, cb, tracker);
        tracker.end();
        return value;
    };

    // The tracker owns the effect's dependencies and reuses them across runs.
    const tracker = new Tracker(run);

    const dispose = () => {
        tracker.disposeAll();
    };

    run();

    return dispose;
};
