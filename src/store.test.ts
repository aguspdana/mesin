import { expect, test, vi } from "vitest";
import { effect } from "./effect";
import { batch } from "./manager";
import { store } from "./store";

test("Multiple read of the same store should trigger update __only__ once", () => {
    const x = store(1);
    let value: number | undefined;

    const effectCb = vi.fn(() => {
        value = x.get() + x.get();
    });
    effect(() => effectCb());
    expect(value).toBe(2);

    x.set(2);
    expect(value).toBe(4);

    expect(effectCb).toHaveBeenCalledTimes(2);
});

test("A batched write notifies with the value captured at commit time, even when a re-entrant write to the same store lands first", () => {
    // Pins the notify value-capture semantics: `set()` freezes the value to
    // notify with at the moment its update commits, NOT the store's live value
    // at notification time. `a` and `b` are both written in one batch; effect A
    // re-commits `b` (to 5) during its own run, before the batch's own notify
    // for `b` fires. effect B watches `b === 2`, which distinguishes the batch's
    // committed value (2) from the re-entrant one (5), so the stale-at-notify
    // difference is observable as an extra effect-B run.
    const a = store(0);
    const b = store(0);

    const effACb = vi.fn(() => {
        if (a.get() === 1) {
            b.set(5);
        }
    });
    effect(() => effACb());

    const effBCb = vi.fn(() => b.select((v) => v === 2));
    effect(() => effBCb());

    batch(() => {
        a.set(1);
        b.set(2);
    });

    expect(a.get()).toBe(1);
    expect(b.get()).toBe(5);
    // effect B: once on setup, then again because the batch notifies `b` with
    // the captured value 2 (which its selector cares about) after `b` is already
    // 5 — reading live `this.value` instead would wrongly skip this second run.
    expect(effBCb).toHaveBeenCalledTimes(2);
});
