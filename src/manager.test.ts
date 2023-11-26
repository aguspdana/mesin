import { expect, test, vi } from 'vitest';
import { compute } from "./computed";
import { effect } from "./effect";
import { batch } from './manager';
import { store } from "./store";

test("Batch update should trigger the effect __only__ once", () => {
	const x = store(0);
	const y = store(10);

	const x_plus_1_cb = vi.fn(() => x.get() + 1);
	const x_plus_1 = compute(x_plus_1_cb);

	const y_plus_1_cb = vi.fn(() => y.get() + 1);
	const y_plus_1 = compute(y_plus_1_cb);

	const x_plus_1_plus_y_plus_1 = compute(() => {
		const x = x_plus_1().get();
		const y = y_plus_1().get();
		return x + y;
	});

	let value: number | undefined;

	const effect_cb = vi.fn(() => {
		value = x_plus_1_plus_y_plus_1().get();
	});
	effect(effect_cb);
	expect(value).toBe(12);

	batch(() => {
		const _x = x.get();
		x.set(_x + 1);
		const _y = y.get();
		y.set(_y + 1);
	});
	expect(value).toBe(14);

	expect(effect_cb).toHaveBeenCalledTimes(2);
	expect(x_plus_1_cb).toHaveBeenCalledTimes(2);
	expect(y_plus_1_cb).toHaveBeenCalledTimes(2);
});

test("Writing to the store from the computed store should trigger the effect __only__ once", () => {
	const x = store(0);
	const y = store(10);

	const x_plus_1_cb = vi.fn(() => {
		const _x = x.get();
		if (_x % 2 != 0) {
			x.set(_x + 1);
		}
		return _x + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	const y_plus_1_cb = vi.fn(() => y.get() + 1);
	const y_plus_1 = compute(y_plus_1_cb);

	let value: number | undefined;

	const effect_cb = vi.fn(() => {
		value = x_plus_1().get() + y_plus_1().get();
	});
	effect(() => effect_cb());
	expect(value).toBe(12);

	x.set(1);
	expect(value).toBe(14);

	expect(x_plus_1_cb).toHaveBeenCalledTimes(3);
	expect(y_plus_1_cb).toHaveBeenCalledTimes(1);
	expect(effect_cb).toHaveBeenCalledTimes(2);
});
