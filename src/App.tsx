import { useEffect } from 'react';
import './App.css'
import { batch, compute, signal, useSignal } from './signal';

const storeSignal = signal({ a: 0, b: 100 });
const otherSignal = signal({ c: 1000 });

const aPlusOneSignal = compute(() => {
	console.log('App/aPlusOneSignal');
	const count = storeSignal.select((s) => s.a);
	return count + 1;
});

const aPlusBPlusOneSignal = compute(() => {
	console.log('App/aPlusBPlusOneSignal');
	const aPlusOne = aPlusOneSignal().get();
	const b = storeSignal.select((s) => s.b);
	return aPlusOne + b;
});

const cPlusOneSignal = compute(() => {
	console.log('App/cPlusOneSignal');
	const count = otherSignal.select((s) => s.c);
	if (count % 2 !== 0) {
		otherSignal.set({ c: count + 1 });
	}
	return count + 1;
});

function incrementA() {
	const store = storeSignal.get();
	storeSignal.set({ ...store, a: store.a + 1 });
}

function incrementB() {
	const store = storeSignal.get();
	storeSignal.set({ ...store, b: store.b + 1 });
}

function incrementC() {
	const other = otherSignal.get();
	otherSignal.set({ ...other, c: other.c + 1 });
}

function incrementBC() {
	batch(() => {
		const store = storeSignal.get();
		const other = otherSignal.get();
		storeSignal.set({ ...store, b: store.b + 1 });
		otherSignal.set({ c: other.c + 1 });
	});
}

function App() {
	const aPlusOne = useSignal(aPlusOneSignal());
	const aPlusBPlusOne = useSignal(aPlusBPlusOneSignal());
	const cPlusOne = useSignal(cPlusOneSignal());

	useEffect(() => console.log(aPlusOne, aPlusBPlusOne, cPlusOne), [aPlusOne, aPlusBPlusOne, cPlusOne]);

	return (
		<>
			<button onClick={incrementA}>Increment A</button>
			<button onClick={incrementB}>Increment B</button>
			<button onClick={incrementC}>Increment C</button>
			<button onClick={incrementBC}>Increment B & C</button>
			<p>A + 1 = {aPlusOne}</p>
			<p>A + 1 + B = {aPlusBPlusOne}</p>
			<p>C + 1 = {cPlusOne}</p>
		</>
	)
}

export default App
