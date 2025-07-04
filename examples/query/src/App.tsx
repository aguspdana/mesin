import { query, store, useStore } from "mesin";
import "./App.css";

const USERS = [
    {
        name: "Nothing",
        age: 0,
    },
    {
        name: "Foo",
        age: 20,
    },
    {
        name: "Bar",
        age: 29,
    },
];

const userId = store(0);

const user = query((n: number): Promise<{ name: string; age: number }> => {
    return new Promise((resolve, reject) => {
        const user = USERS[n];
        setTimeout(() => {
            if (user) {
                resolve(user);
            }
            reject(new Error("User not found"));
        }, 1000);
    });
});

const increment = () => {
    userId.set(userId.get() + 1);
};

const decrement = () => {
    userId.set(userId.get() - 1);
};

const User = (props: { id: number }) => {
    const { id } = props;
    const _user = useStore(user(id));
    if (_user.status === "error") {
        if (_user.error instanceof Error) {
            return <p>{_user.error.toString()}</p>;
        }
        return <p>Error</p>;
    }
    if (_user.status === "pending") {
        return <p>Loading user {id}</p>;
    }
    return (
        <p>
            {_user.value.name} is {_user.value.age} years old
        </p>
    );
};

const App = () => {
    const id = useStore(userId);

    return (
        <div className="App">
            <div className="actions">
                <button onClick={increment}>Increment user id</button>
                <button onClick={decrement}>Decrement user id</button>
            </div>
            <p>User id = {id}</p>
            <User id={id} />
        </div>
    );
};

export default App;
