import { expect, test, vi } from 'vitest';
import { effect } from "./effect";
import { query } from './query';
import { QueryState } from './types';

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Query state should be in "finished" state after the initial fetch resolved', async() => {
	const count = query(
		async () => {
			await sleep(10);
			return 1;
		},
		{
			update_every: 10,
			remove_after: 10,
		}
	);

	let state: QueryState<number> | null = null;
	const effect_cb = vi.fn(() => {
		state = count().get();
	});
	effect(effect_cb);
	expect(state).toMatchObject({ status: 'pending' });

	await sleep(20);
	expect(state).toMatchObject({ status: 'finished', value: 1 });

	expect(effect_cb).toHaveBeenCalledTimes(2);
});

test('Query should be in "error" state after the fetcher throws an error', async () => {
	const count = query(
		async () => {
			await sleep(10);
			throw 'Ops';
		},
		{
			update_every: 10,
			remove_after: 10,
		}
	);

	let state: QueryState<number> | null = null;
	const effect_cb = vi.fn(() => {
		state = count().get();
	});
	effect(effect_cb);
	expect(state).toMatchObject({ status: 'pending' });

	await sleep(20);
	expect(state).toMatchObject({ status: 'error', error: 'Ops' });

	expect(effect_cb).toHaveBeenCalledTimes(2);
})

test('Should update every n milliseconds', async () => {
	let source = 1;
	const count = query(
		async () => {
			await sleep(10);
			source += 2;
			return source;
		},
		{
			update_every: 10,
			remove_after: 10,
		}
	);

	let state: QueryState<number> | null = null;
	const effect_cb = vi.fn(() => {
		state = count().get();
	});
	effect(effect_cb);
	expect(state).toMatchObject({ status: 'pending' });
	await sleep(15);
	expect(state).toMatchObject({ status: 'finished', value: 3 });
	await sleep(20);
	expect(state).toMatchObject({ status: 'finished', value: 5 });
	expect(effect_cb).toHaveBeenCalledTimes(3);
})

test('Setting the query value should invalidate ongoing fetching and then update after `update_every` milliseconds', async () => {
	let source = 1;
	const count = query(
		async () => {
			await sleep(10);
			source += 2;
			return source;
		},
		{
			update_every: 10,
			remove_after: 10,
		}
	);

	let state: QueryState<number> | null = null;
	const effect_cb = vi.fn(() => {
		state = count().get();
	});
	effect(effect_cb);
	expect(state).toMatchObject({ status: 'pending' });
	await sleep(5);
	count().set(2);
	expect(state).toMatchObject({ status: 'finished', value: 2 });
	await sleep(25);
	expect(state).toMatchObject({ status: 'finished', value: 5 });
	expect(effect_cb).toHaveBeenCalledTimes(3);
})

test('The query should be destroyed after not subscribed for `delete_after` milliseconds', async () => {
	let source = 1;
	const count = query(
		async () => {
			await sleep(10);
			source += 2;
			return source;
		},
		{
			update_every: 20,
			remove_after: 20,
		}
	);

	expect(count().get()).toMatchObject({ status: 'pending' });
	await sleep(15);
	expect(count().get()).toMatchObject({ status: 'finished', value: 3 });
	await sleep(20);
	expect(count().get()).toMatchObject({ status: 'pending' });
	await sleep(15);
	expect(count().get()).toMatchObject({ status: 'finished', value: 5 });
})
