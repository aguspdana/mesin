# Query

```typescript
const user = query((id: string) => {
    return fetch(`http://localhost:3000/users/${id}`).then((res) =>
        res.data.json()
    );
});

const User = (props: { id: string }) => {
    const user_state = useStore(user(id));

    if (user_state.status === "pending") {
        return <p>Loading...</p>;
    }

    if (user_state.status === "error") {
        return <p>Opps</p>;
    }

    return <p>{user_state.value.name}</p>;
};
```
