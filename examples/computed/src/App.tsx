import { compute, store, useStore } from "mesin";
import "./App.css";

const x = store({ a: 1, b: 2 });
const y = store({ c: 3, d: 4 });

const a = compute(() => x.select((v) => v.a));
const b = compute(() => x.select((v) => v.b));
const c = compute(() => y.select((v) => v.c));
const d = compute(() => y.select((v) => v.d));

const ac = compute(() => a().get() + c().get());
const bd = compute(() => b().get() + d().get());
const abcd = compute(() => ac().get() + bd().get());

function increment_a() {
    const current = x.get();
    x.set({ ...current, a: current.a + 1 });
}

function increment_b() {
    const current = x.get();
    x.set({ ...current, b: current.b + 1 });
}

function increment_c() {
    const current = y.get();
    y.set({ ...current, c: current.c + 1 });
}

function increment_d() {
    const current = y.get();
    y.set({ ...current, d: current.d + 1 });
}

function App() {
    const _a = useStore(a());
    const _b = useStore(b());
    const _c = useStore(c());
    const _d = useStore(d());
    const _abcd = useStore(abcd());

    return (
        <div className="App">
            <div className="actions">
                <button onClick={increment_a}>a = {_a}</button>
                <button onClick={increment_b}>b = {_b}</button>
                <button onClick={increment_c}>c = {_c}</button>
                <button onClick={increment_d}>d = {_d}</button>
            </div>
            <p>abcd = {_abcd}</p>
        </div>
    );
}

export default App;
