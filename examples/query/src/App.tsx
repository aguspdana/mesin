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

const user_id = store(0);

const user = query((n: number): Promise<{ name: string; age: number }> => {
  return new Promise((resolve, reject) => {
    const user = USERS[n];
    setTimeout(() => {
      if (user) {
        resolve(user);
      }
      reject(new Error("User not found"));
    }, 5000);
  });
});

function increment() {
  user_id.set(user_id.get() + 1);
}

function User(props: { id: number }) {
  const { id } = props;
  const _user = useStore(user(id));
  if (_user.state === "error") {
    if (_user.error instanceof Error) {
      return <p>{_user.error.toString()}</p>;
    }
    return <p>Error</p>;
  }
  if (_user.state === "pending") {
    return <p>Loading user {id}</p>;
  }
  return (
    <p>
      {_user.value.name} is {_user.value.age} years old
    </p>
  );
}

function App() {
  const id = useStore(user_id);

  return (
    <div className="App">
      <button onClick={increment}>Increment user id {id}</button>
      <User id={id} />
    </div>
  );
}

export default App;
