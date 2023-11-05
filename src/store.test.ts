import { expect, test, vi } from 'vitest';
import { effect } from "./effect";
import { store } from "./store";

test("Multiple read of the same store should trigger update __only__ once", () => {
	const x = store(1);
	let value: number | undefined;

	const effect_cb = vi.fn(() => {
		value = x.get() + x.get();
	});
	effect(() => effect_cb());
	expect(value).toBe(2);

	x.set(2);
	expect(value).toBe(4);

	expect(effect_cb).toHaveBeenCalledTimes(2);
});