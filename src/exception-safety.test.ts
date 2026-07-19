import { expect, test } from "vitest";
import { compute } from "./computed";
import { effect } from "./effect";
import { store } from "./store";

// ===========================================================================
// Exception safety: a throwing user callback must not corrupt the manager.
//
// Manager.compute(), effect.run() and Computed.compute() push a reactive
// context / set flags before invoking the user callback but pop/reset them
// only on the success path. If the callback throws, the context stack is left
// non-empty (and Computed.isComputing left true), wedging the whole reactive
// system: every subsequent store.set() is treated as "inside a batch" and
// deferred forever, and the computed permanently throws CircularDependencyError.
//
// These tests assert recovery and are EXPECTED TO FAIL until the fix.
// ===========================================================================

test("manager recovers after an effect callback throws", () => {
    const s = store(0);

    // An effect whose callback throws must propagate the error...
    expect(() => {
        effect(() => {
            throw new Error("boom");
        });
    }).toThrow("boom");

    // ...but must not leave a dead context on the stack. A fresh effect + a
    // subsequent write must still propagate.
    let observed: number | undefined;
    effect(() => {
        observed = s.get();
    });
    expect(observed).toBe(0);

    s.set(1);
    expect(observed).toBe(1);
});

test("manager recovers and the computed stays usable after a computed callback throws", () => {
    const s = store(0);
    let shouldThrow = true;

    const c = compute(() => {
        const v = s.get();
        if (shouldThrow) {
            throw new Error("boom");
        }
        return v;
    });

    // The first read throws (uncaught by the computed's own callback).
    expect(() => c().get()).toThrow("boom");

    // The manager must not be wedged: a fresh effect + write must propagate.
    shouldThrow = false;
    let observed: number | undefined;
    effect(() => {
        observed = s.get();
    });
    expect(observed).toBe(0);

    s.set(5);
    expect(observed).toBe(5);

    // And the computed itself must be usable again (isComputing was reset),
    // not permanently throwing CircularDependencyError.
    expect(c().get()).toBe(5);
});
