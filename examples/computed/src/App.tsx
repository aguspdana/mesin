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

const incrementA = () => {
    const current = x.get();
    x.set({ ...current, a: current.a + 1 });
};

const incrementB = () => {
    const current = x.get();
    x.set({ ...current, b: current.b + 1 });
};

const incrementC = () => {
    const current = y.get();
    y.set({ ...current, c: current.c + 1 });
};

const incrementD = () => {
    const current = y.get();
    y.set({ ...current, d: current.d + 1 });
};

const App = () => {
    const _a = useStore(a());
    const _b = useStore(b());
    const _c = useStore(c());
    const _d = useStore(d());
    const _abcd = useStore(abcd());

    return (
        <div className="App">
            <div className="actions">
                <button onClick={incrementA}>a = {_a}</button>
                <button onClick={incrementB}>b = {_b}</button>
                <button onClick={incrementC}>c = {_c}</button>
                <button onClick={incrementD}>d = {_d}</button>
            </div>
            <p>abcd = {_abcd}</p>
        </div>
    );
};

export default App;
