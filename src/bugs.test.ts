import { expect, test, vi } from "vitest";
import { compute } from "./computed";
import { effect } from "./effect";
import { batch } from "./manager";
import { query } from "./query";
import { store } from "./store";
import { storeInStorage } from "./storeInStorage";
import { sleep } from "./utils";

// ===========================================================================
// These tests document CONFIRMED bugs. They assert the CORRECT behavior, so
// they are EXPECTED TO FAIL against the current (unfixed) code. Each failure
// message pins the exact wrong value the bug produces.
// ===========================================================================

// ---------------------------------------------------------------------------
// BUG #1 (HIGH) — Missed update: stranded pendingNotifications.
//
// effect.run() and Manager.maybeRunBatch() never flush pendingNotifications;
// only Computed.compute() does. When a computed is pull-recomputed INSIDE an
// effect's context, notifications to that computed's OTHER subscribers are
// deferred and then never flushed, so those subscribers silently miss the
// update.
//
// Graph: w=compute(s), x=compute(s), z=compute(x). Effect E reads w THEN x, so
// on s.set E is notified via w first and pulls a still-stale x, recomputing x
// inside E's context. x's other subscriber (z, observed by effect E1) is
// stranded. Trigger is subscription/read ORDER (the reverse order is fine).
// ---------------------------------------------------------------------------
test("BUG#1: sibling computed must not miss an update in an effect-rooted diamond", () => {
    const s = store(0);
    const w = compute(() => s.get());
    const x = compute(() => s.get());
    const z = compute(() => x().get());

    // Run E first so s.subscribers order is [w, x] (w notified first).
    effect(() => {
        w().get();
        x().get();
    });

    let zVal: number | undefined;
    const zCb = vi.fn(() => {
        zVal = z().get();
    });
    effect(zCb);
    expect(zVal).toBe(0);

    s.set(1);

    // Capture WITHOUT a top-level .get(), which would itself repair the miss.
    const observedZ = zVal;
    const zRuns = zCb.mock.calls.length;

    // x changed 0 -> 1, so z (=x) must be 1 and its effect must have re-run.
    expect(observedZ).toBe(1);
    expect(zRuns).toBe(2);
});

test("BUG#1 (batch): same miss when the write is committed via batch()", () => {
    const s = store(0);
    const w = compute(() => s.get());
    const x = compute(() => s.get());
    const z = compute(() => x().get());

    effect(() => {
        w().get();
        x().get();
    });

    let zVal: number | undefined;
    const zCb = vi.fn(() => {
        zVal = z().get();
    });
    effect(zCb);

    batch(() => {
        s.set(1);
    });

    expect(zVal).toBe(1);
    expect(zCb).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------
// BUG #2 (HIGH) — Query.reset() during an in-flight load yields stale data and
// no reload. reset() neither bumps loadId (so the in-flight load is not
// invalidated) nor reloads (guard is `!isLoading`). The in-flight load resolves
// and overwrites `pending` with the PRE-reset value; no refresh happens.
// ---------------------------------------------------------------------------
test("BUG#2: reset() during an in-flight load reloads to fresh data", async () => {
    let calls = 0;
    const q = query(
        async () => {
            calls++;
            const n = calls;
            await sleep(30);
            return n; // 1 for first load, 2 for the reload, ...
        },
        { updateEvery: 100000, removeAfter: 100000, autoloadOnServer: true }
    );

    const dispose = effect(() => q().get());

    await sleep(10); // load #1 is in flight (loader sleeps 30), isLoading=true
    q().reset(); // should invalidate + go pending + reload

    await sleep(60); // let load #1 resolve and any reload finish
    const final = q().get();
    dispose();

    // A correct reset with a live subscriber reloads and ends on FRESH data.
    expect(calls).toBe(2);
    expect(final).toMatchObject({ status: "finished", data: 2 });
});

// ---------------------------------------------------------------------------
// BUG #3 (MEDIUM) — set() back to the committed value inside a batch drops the
// real last write. store.set()'s `if (value === this.value) return;` compares
// against the COMMITTED value, but during a batch the pending write lives in
// MANAGER.pendingUpdates and this.value has not advanced. A later set() equal
// to the committed value early-returns and leaves the earlier pending write in
// place, violating last-write-wins.
// ---------------------------------------------------------------------------
test("BUG#3: batch last-write-wins when the last write equals the committed value", () => {
    const a = store(0);
    batch(() => {
        a.set(1);
        a.set(0); // last write -> should end at 0
    });
    expect(a.get()).toBe(0);
});

test("BUG#3 (multi): last write equal to committed value must still win", () => {
    const b = store(5);
    batch(() => {
        b.set(9);
        b.set(7);
        b.set(5); // last write equals committed -> should end at 5
    });
    expect(b.get()).toBe(5);
});

test("BUG#3 (effect): write-then-revert inside a reactive block nets no change", () => {
    const a = store(0);
    const trigger = store(0);
    effect(() => {
        if (trigger.get() === 1) {
            a.set(1);
            a.set(0); // revert -> net effect is 0
        }
    });
    trigger.set(1);
    expect(a.get()).toBe(0);
});

// ---------------------------------------------------------------------------
// BUG #5 (MEDIUM) — storeInStorage serves a stale value after a zero-subscriber
// gap. The backing store is seeded from get() at construction; the external
// `listen` is detached at 0 subscribers and re-attached at 1, but on re-attach
// the source is never re-read. An external write that lands while unsubscribed
// is missed until the NEXT external change.
// ---------------------------------------------------------------------------
test("BUG#5: value is refreshed from the source when re-subscribing after a gap", () => {
    const mock = new ExternalStoreMock("A");
    const s = storeInStorage<string>({
        get: () => mock.get(),
        set: (v) => mock.set(v),
        listen: (cb) => mock.listen(cb),
    });

    // First subscription, then leave (0 subscribers -> listener detached).
    const dispose1 = effect(() => s.get());
    dispose1();

    // External write happens while there is no subscriber/listener.
    mock.setFromExternalContext("B");

    // Re-subscribe: the store should reflect the current source value "B".
    let observed: string | undefined;
    effect(() => {
        observed = s.get();
    });

    expect(s.get()).toBe("B");
    expect(observed).toBe("B");
});

// Minimal external store that only notifies on external writes (mirrors the
// LocalStorageMock used in storeInStorage.test.ts).
class ExternalStoreMock<T> {
    private value: T;
    private listeners = new Set<(value: T) => void>();
    constructor(initial: T) {
        this.value = initial;
    }
    get(): T {
        return this.value;
    }
    set(value: T): void {
        this.value = value;
    }
    listen(cb: (value: T) => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }
    setFromExternalContext(value: T): void {
        this.value = value;
        for (const l of this.listeners.values()) {
            l(value);
        }
    }
}
