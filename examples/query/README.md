# Query

```typescript
const user = query((id: string) => {
    return fetch(`http://localhost:3000/users/${id}`).then((res) =>
        res.data.json()
    );
});

const User = (props: { id: string }) => {
    const userState = useStore(user(id));

    if (userState.status === "pending") {
        return <p>Loading...</p>;
    }

    if (userState.status === "error") {
        return <p>Opps</p>;
    }

    return <p>{userState.value.name}</p>;
};
```
