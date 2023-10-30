import { signal, effect, compute, batch, stringify } from "./signal";

test("Should update the computed signal when the selected dependency changes", () => {
	const store_1 = signal({ a: 0, b: 10 });

	const x_plus_1_cb = jest.fn(({ key }: { key: 'a' | 'b' }) => {
		return store_1.select((v) => v[key]) + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	let value: number | undefined;

	const effect_cb = jest.fn(() => {
		value = x_plus_1({ key: 'a' }).get();
	});
	effect(() => effect_cb());
	expect(value).toBe(1);

	store_1.set({ a: 1, b: 10 });
	expect(value).toBe(2);

	expect(x_plus_1_cb).toHaveBeenCalledTimes(2);
	expect(effect_cb).toHaveBeenCalledTimes(2);
});

test("Should __not__ update the computed signal when the selected dependency __doesn't__ change", () => {
	const store_1 = signal({ a: 0, b: 10 });

	const x_plus_1_cb = jest.fn(({ key }: { key: 'a' | 'b' }) => {
		return store_1.select((v) => v[key]) + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	let value: number | undefined;

	const effect_cb = jest.fn(() => {
		value = x_plus_1({ key: 'a' }).get();
	});
	effect(effect_cb);
	expect(value).toBe(1);

	store_1.set({ a: 0, b: 11 });
	expect(value).toBe(1);

	expect(x_plus_1_cb).toHaveBeenCalledTimes(1);
	expect(effect_cb).toHaveBeenCalledTimes(1);
});

test("State update across signals and computed signals should be atomic", () => {
	const x = signal(1);
	const y = compute(() => x.get() + 1);
	let xy: { x: number, y: number } | undefined;

	const effect_cb = jest.fn(() => {
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

test("Multiple read of the same signal should trigger update __only__ once", () => {
	const x = signal(1);
	let value: number | undefined;

	const effect_cb = jest.fn(() => {
		value = x.get() + x.get();
	});
	effect(() => effect_cb());
	expect(value).toBe(2);

	x.set(2);
	expect(value).toBe(4);

	expect(effect_cb).toHaveBeenCalledTimes(2);
});

test("Batch update should trigger the effect __only__ once", () => {
	const x = signal(0);
	const y = signal(10);

	const x_plus_1_cb = jest.fn(() => {
		return x.select((v) => v) + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	const y_plus_1_cb = jest.fn(() => {
		return y.select((v) => v) + 1;
	});
	const y_plus_1 = compute(y_plus_1_cb);

	const x_plus_1_plus_y_plus_1 = compute(() => {
		const x = x_plus_1().get();
		const y = y_plus_1().get();
		return x + y;
	});

	let value: number | undefined;

	const effect_cb = jest.fn(() => {
		value = x_plus_1_plus_y_plus_1({ key: 'a' }).get();
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

test("Writing to the signal from the computed signal should trigger the effect __only__ once", () => {
	const x = signal(0);
	const y = signal(10);

	const x_plus_1_cb = jest.fn(() => {
		const _x = x.get();
		if (_x % 2 != 0) {
			x.set(_x + 1);
		}
		return _x + 1;
	});
	const x_plus_1 = compute(x_plus_1_cb);

	const y_plus_1_cb = jest.fn(() => y.get() + 1);
	const y_plus_1 = compute(y_plus_1_cb);

	let value: number | undefined;

	const effect_cb = jest.fn(() => {
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

test("stringify() should return a stable result", () => {
	expect(stringify(undefined)).toBe('_');
	expect(stringify('"')).toBe('"\\""');
	expect(stringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	expect(stringify({ b: undefined, a: 2 })).toBe('{"a":2}');
	expect(stringify({ b: [3, 1, 2], a: 2 })).toBe('{"a":2,"b":[3,1,2]}');
	expect(stringify([3, 1, 2])).toBe('[3,1,2]');
	expect(stringify([null, 1])).toBe('[null,1]');
	expect(stringify([undefined, 1])).toBe('[_,1]');
	expect(stringify([1, undefined])).toBe('[1,_]');
	expect(stringify([undefined])).toBe('[_]');
	expect(stringify([{b: 1, a: 2 }, 1])).toBe('[{"a":2,"b":1},1]');
});
