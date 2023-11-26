import { expect, test, vi } from 'vitest';
import { REMOVE_FROM_REGISTRY_AFTER, compute } from "./computed";
import { effect } from "./effect";
import { store } from "./store";
import { batch } from '.';
import { sleep } from './utils';

test("Should update the computed store when the selected dependency changes", () => {
	const store_1 = store({ a: 0, b: 10 });

	const x_plus_1_cb = vi.fn(({ key }: { key: 'a' | 'b' }) => {
		return store_1.select((v) => v[key]) + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	let value: number | undefined;

	const effect_cb = vi.fn(() => {
		value = x_plus_1({ key: 'a' }).get();
	});
	effect(() => effect_cb());
	expect(value).toBe(1);

	store_1.set({ a: 1, b: 10 });
	expect(value).toBe(2);

	expect(x_plus_1_cb).toHaveBeenCalledTimes(2);
	expect(effect_cb).toHaveBeenCalledTimes(2);
});

test("Should __not__ update the computed store when the selected dependency __doesn't__ change", () => {
	const store_1 = store({ a: 0, b: 10 });

	const x_plus_1_cb = vi.fn(({ key }: { key: 'a' | 'b' }) => {
		return store_1.select((v) => v[key]) + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	let value: number | undefined;

	const effect_cb = vi.fn(() => {
		value = x_plus_1({ key: 'a' }).get();
	});
	effect(effect_cb);
	expect(value).toBe(1);

	store_1.set({ a: 0, b: 11 });
	expect(value).toBe(1);

	expect(x_plus_1_cb).toHaveBeenCalledTimes(1);
	expect(effect_cb).toHaveBeenCalledTimes(1);
});

test("State update across stores and computed stores should be atomic", () => {
	const x = store(1);
	const y = compute(() => x.get() + 1);
	let xy: { x: number, y: number } | undefined;

	const effect_cb = vi.fn(() => {
		xy = {
			x: x.get(),
			y: y().get(),
		};
	});
	effect(effect_cb);
	expect(xy).toMatchObject({ x: 1, y: 2});

	x.set(2);
	expect(xy).toMatchObject({ x: 2, y: 3});

	expect(effect_cb).toBeCalledTimes(2);
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
	const b_cb = vi.fn(() => a.get());
	const b = compute(b_cb);
	const c_cb = vi.fn(() => b().get());
	const c = compute(c_cb);
	const dispose = effect(() => c().get());
	dispose();
	a.set(2);
	expect(b_cb).toBeCalledTimes(1);
	expect(c_cb).toBeCalledTimes(1);
});

test("When there is no effect in the dependency chain, and there are multiple updates on the writable store before the computed stores are removed from the register, they should be recomputed __only__ once", () => {
	const a = store(1);
	const b_cb = vi.fn(() => a.get());
	const b = compute(b_cb);
	const c_cb = vi.fn(() => b().get());
	const c = compute(c_cb);
	const d_cb = vi.fn(() => c().get());
	const d = compute(d_cb);
	d().get();
	a.set(2);
	a.set(3);
	expect(b_cb).toBeCalledTimes(2);
	expect(c_cb).toBeCalledTimes(2);
	expect(d_cb).toBeCalledTimes(1);
});

test("After the computed stores are removed from the registry, they should not be updated", async () => {
	const a = store(1);
	const b_cb = vi.fn(() => a.get());
	const b = compute(b_cb);
	const c_cb = vi.fn(() => b().get());
	const c = compute(c_cb);
	const d_cb = vi.fn(() => c().get());
	const d = compute(d_cb);
	d().get();
	await sleep(REMOVE_FROM_REGISTRY_AFTER + 5);
	a.set(2);
	a.set(3);
	expect(b_cb).toBeCalledTimes(1);
	expect(c_cb).toBeCalledTimes(1);
	expect(d_cb).toBeCalledTimes(1);
});

test("After the computed stores are removed from the registry, they should be reactive after being subscribed again", async () => {
	const a = store(1);
	const b_cb = vi.fn(() => a.get());
	const b = compute(b_cb);
	const c_cb = vi.fn(() => b().get());
	const c = compute(c_cb);
	const d_cb = vi.fn(() => c().get());
	const d = compute(d_cb);
	const _d = d();
	_d.get();
	await sleep(REMOVE_FROM_REGISTRY_AFTER + 5);
	effect(() => _d.get());
	a.set(2);
	a.set(3);
	expect(b_cb).toBeCalledTimes(4);
	expect(c_cb).toBeCalledTimes(4);
	expect(d_cb).toBeCalledTimes(4);
});

test("The computed store that is computed without being subscribed to should be reactive after being subscribed to", () => {
	const a = store(1);
	const b_cb = vi.fn(() => a.get());
	const b = compute(b_cb);
	const c_cb = vi.fn(() => b().get());
	const c = compute(c_cb);
	c().get();
	let value: number | undefined;
	effect(() => {
		value = c().get();
	});
	a.set(2);
	expect(value).toBe(2);
	expect(b_cb).toBeCalledTimes(2);
	expect(c_cb).toBeCalledTimes(2);
});