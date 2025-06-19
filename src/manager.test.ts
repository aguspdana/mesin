import { expect, test, vi } from "vitest";
import { compute } from "./computed";
import { effect } from "./effect";
import { batch } from "./manager";
import { store } from "./store";

test("Batch update should trigger the effect __only__ once", () => {
    const x = store(0);
    const y = store(10);

    const xPlus1Cb = vi.fn(() => x.get() + 1);
    const xPlus1 = compute(xPlus1Cb);

    const yPlus1Cb = vi.fn(() => y.get() + 1);
    const yPlus1 = compute(yPlus1Cb);

    const xPlus1PlusYPlus1 = compute(() => {
        const x = xPlus1().get();
        const y = yPlus1().get();
        return x + y;
    });

    let value: number | undefined;

    const effectCb = vi.fn(() => {
        value = xPlus1PlusYPlus1().get();
    });
    effect(effectCb);
    expect(value).toBe(12);

    batch(() => {
        const _x = x.get();
        x.set(_x + 1);
        const _y = y.get();
        y.set(_y + 1);
    });
    expect(value).toBe(14);

    expect(effectCb).toHaveBeenCalledTimes(2);
    expect(xPlus1Cb).toHaveBeenCalledTimes(2);
    expect(yPlus1Cb).toHaveBeenCalledTimes(2);
});

test("Writing to the store from the computed store should trigger the effect __only__ once", () => {
    const x = store(0);
    const y = store(10);

    const xPlus1Cb = vi.fn(() => {
        const _x = x.get();
        if (_x % 2 != 0) {
            x.set(_x + 1);
        }
        return _x + 1;
    });
    const xPlus1 = compute(xPlus1Cb);

    const yPlus1Cb = vi.fn(() => y.get() + 1);
    const yPlus1 = compute(yPlus1Cb);

    let value: number | undefined;

    const effectCb = vi.fn(() => {
        value = xPlus1().get() + yPlus1().get();
    });
    effect(() => effectCb());
    expect(value).toBe(12);

    x.set(1);
    expect(value).toBe(14);

    expect(xPlus1Cb).toHaveBeenCalledTimes(3);
    expect(yPlus1Cb).toHaveBeenCalledTimes(1);
    expect(effectCb).toHaveBeenCalledTimes(2);
});
