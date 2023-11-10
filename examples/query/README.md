# Query

```typescript
const user = query((id: string) => {
   return fetch(`http://localhost:3000/users/${id}`)
      .then((res) => res.data.json());
});
```