import { expect, test, vi } from "vitest";
import { REMOVE_FROM_REGISTRY_AFTER, compute } from "./computed";
import { effect } from "./effect";
import { store } from "./store";
import { batch } from ".";
import { sleep } from "./utils";

test("Should update the computed store when the selected dependency changes", () => {
    const store1 = store({ a: 0, b: 10 });

    const xPlus1Cb = vi.fn(({ key }: { key: "a" | "b" }) => {
        return store1.select((v) => v[key]) + 1;
    });
    const xPlus1 = compute(xPlus1Cb);

    let value: number | undefined;

    const effectCb = vi.fn(() => {
        value = xPlus1({ key: "a" }).get();
    });
    effect(() => effectCb());
    expect(value).toBe(1);

    store1.set({ a: 1, b: 10 });
    expect(value).toBe(2);

    expect(xPlus1Cb).toHaveBeenCalledTimes(2);
    expect(effectCb).toHaveBeenCalledTimes(2);
});

test("Should __not__ update the computed store when the selected dependency __does not__ change", () => {
    const store1 = store({ a: 0, b: 10 });

    const xPlus1Cb = vi.fn(({ key }: { key: "a" | "b" }) => {
        return store1.select((v) => v[key]) + 1;
    });
    const xPlus1 = compute(xPlus1Cb);

    let value: number | undefined;

    const effectCb = vi.fn(() => {
        value = xPlus1({ key: "a" }).get();
    });
    effect(effectCb);
    expect(value).toBe(1);

    store1.set({ a: 0, b: 11 });
    expect(value).toBe(1);

    expect(xPlus1Cb).toHaveBeenCalledTimes(1);
    expect(effectCb).toHaveBeenCalledTimes(1);
});

test("State update across stores and computed stores should be atomic", () => {
    const x = store(1);
    const y = compute(() => x.get() + 1);
    let xy: { x: number; y: number } | undefined;

    const effectCb = vi.fn(() => {
        xy = {
            x: x.get(),
            y: y().get(),
        };
    });
    effect(effectCb);
    expect(xy).toMatchObject({ x: 1, y: 2 });

    x.set(2);
    expect(xy).toMatchObject({ x: 2, y: 3 });

    expect(effectCb).toBeCalledTimes(2);
});

test("Should throw an error when circular dependency is detected", () => {
    const x = compute(() => {
        try {
            x().get();
        } catch {
            return 0;
        }
    });
    expect(x().get()).toBe(0);
});

test("Should __not__ trigger false circular dependency error", () => {
    const a = store(1);
    const b = store(2);
    const c = compute(() => a.get());
    const d = compute(() => c().get());
    const e = compute(() => d().get() + b.get());
    const f = compute(() => e().get() + c().get());
    effect(() => {
        f().get();
    });
    batch(() => {
        b.set(3);
        a.set(4);
    });
});

test("Should unsubscribe dependencies when no subscriber left", () => {
    const a = store(1);
    const bCb = vi.fn(() => a.get());
    const b = compute(bCb);
    const cCb = vi.fn(() => b().get());
    const c = compute(cCb);
    const dispose = effect(() => c().get());
    dispose();
    a.set(2);
    expect(bCb).toBeCalledTimes(1);
    expect(cCb).toBeCalledTimes(1);
});

test("When there is no effect in the dependency chain, and there are multiple updates on the writable store before the computed stores are removed from the register, they should be recomputed __only__ once", () => {
    const a = store(1);
    const bCb = vi.fn(() => a.get());
    const b = compute(bCb);
    const cCb = vi.fn(() => b().get());
    const c = compute(cCb);
    const dCb = vi.fn(() => c().get());
    const d = compute(dCb);
    d().get();
    a.set(2);
    a.set(3);
    expect(bCb).toBeCalledTimes(2);
    expect(cCb).toBeCalledTimes(2);
    expect(dCb).toBeCalledTimes(1);
});

test("After the computed stores are removed from the registry, they should not be updated", async () => {
    const a = store(1);
    const bCb = vi.fn(() => a.get());
    const b = compute(bCb);
    const cCb = vi.fn(() => b().get());
    const c = compute(cCb);
    const dCb = vi.fn(() => c().get());
    const d = compute(dCb);
    d().get();
    await sleep(REMOVE_FROM_REGISTRY_AFTER + 5);
    a.set(2);
    a.set(3);
    expect(bCb).toBeCalledTimes(1);
    expect(cCb).toBeCalledTimes(1);
    expect(dCb).toBeCalledTimes(1);
});

test("After the computed stores are removed from the registry, they should be reactive after being subscribed again", async () => {
    const a = store(1);
    const bCb = vi.fn(() => a.get());
    const b = compute(bCb);
    const cCb = vi.fn(() => b().get());
    const c = compute(cCb);
    const dCb = vi.fn(() => c().get());
    const d = compute(dCb);
    const _d = d();
    _d.get();
    await sleep(REMOVE_FROM_REGISTRY_AFTER + 5);
    effect(() => _d.get());
    a.set(2);
    a.set(3);
    expect(bCb).toBeCalledTimes(4);
    expect(cCb).toBeCalledTimes(4);
    expect(dCb).toBeCalledTimes(4);
});

test("The computed store that is computed without being subscribed to should be reactive after being subscribed to", () => {
    const a = store(1);
    const bCb = vi.fn(() => a.get());
    const b = compute(bCb);
    const cCb = vi.fn(() => b().get());
    const c = compute(cCb);
    c().get();
    let value: number | undefined;
    effect(() => {
        value = c().get();
    });
    a.set(2);
    expect(value).toBe(2);
    expect(bCb).toBeCalledTimes(2);
    expect(cCb).toBeCalledTimes(2);
});
