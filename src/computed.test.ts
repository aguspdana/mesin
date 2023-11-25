import { expect, test, vi } from 'vitest';
import { compute } from "./computed";
import { effect } from "./effect";
import { store } from "./store";
import { batch } from '.';

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

test("Should not trigger false circular dependency error", () => {
	const a = store(1);
	const b = store(2);
	const c = compute(() => a.get());
	const d = compute(() => c().get() + b.get());
	const e = compute(() => d().get() + c().get());
	let current_e: number | undefined;
	effect(() => {
		current_e = e().get();
	});
	batch(() => {
		b.set(3);
		a.set(4);
	});
	expect(current_e).toBe(11);
});
