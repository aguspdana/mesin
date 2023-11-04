import { useEffect } from 'react';
import './App.css'
import { batch, compute, store, useStore } from './mesin';

const primary = store({ a: 0, b: 100 });
const secondary = store({ c: 1000 });

const a_plus_1 = compute(() => {
	console.log('App/a_plus_1');
	const a = primary.select((s) => s.a);
	return a + 1;
});

const a_plus_b_plus_1 = compute(() => {
	console.log('App/a_plus_b_plus_1');
	const a_plus_1_value = a_plus_1().get();
	const b = primary.select((s) => s.b);
	return a_plus_1_value + b;
});

const c_plus_1 = compute(() => {
	console.log('App/c_plus_1');
	const c = secondary.select((s) => s.c);
	if (c % 2 !== 0) {
		secondary.set({ c: c + 1 });
	}
	return c + 1;
});

function increment_a() {
	const store = primary.get();
	primary.set({ ...store, a: store.a + 1 });
}

function increment_b() {
	const store = primary.get();
	primary.set({ ...store, b: store.b + 1 });
}

function increment_c() {
	const secondary_value = secondary.get();
	secondary.set({ ...secondary_value, c: secondary_value.c + 1 });
}

function increment_bc() {
	batch(() => {
		const primary_value = primary.get();
		const secondary_value = secondary.get();
		primary.set({ ...primary_value, b: primary_value.b + 1 });
		secondary.set({ c: secondary_value.c + 1 });
	});
}

function App() {
	const a_plus_1_value = useStore(a_plus_1());
	const a_plus_b_plus_1_value = useStore(a_plus_b_plus_1());
	const c_plus_1_value = useStore(c_plus_1());

	useEffect(
		() => {
			console.log(
				a_plus_1_value,
				a_plus_b_plus_1_value,
				c_plus_1_value
			);
		},
		[
			a_plus_1_value,
			a_plus_b_plus_1_value,
			c_plus_1_value
		]
	);

	return (
		<>
			<button onClick={increment_a}>Increment A</button>
			<button onClick={increment_b}>Increment B</button>
			<button onClick={increment_c}>Increment C</button>
			<button onClick={increment_bc}>Increment B & C</button>
			<p>A + 1 = {a_plus_1_value}</p>
			<p>A + 1 + B = {a_plus_b_plus_1_value}</p>
			<p>C + 1 = {c_plus_1_value}</p>
		</>
	)
}

export default App
