# Mesin

(Pronounced like _machine_.)

What if Jotai, Recoil, SolidJS's signal, and React Query are mixed together? That's Mesin.

-   Build complex states with dynamic dependencies like spreadsheet's state.
-   Track dependencies using signal like SolidJS.
-   Computed stores used in multiple places are computed only once.
-   No memory leak.
-   Circular dependency can be handled.
-   Dedupe and revalidate queries like React Query\* but without dealing with keys.

[**CodeSandbox**](https://codesandbox.io/p/sandbox/mesin-24nhch)

## Install

```
npm install mesin
```

## Example

```typescript
const users = store({
    "user-1": {
        name: "Foo",
        friends: ["user-2"],
    },
    "user-2": {
        name: "Bar",
        friends: ["user-1"],
    },
});

const user = compute((id: string) => {
    users.select((all_users) => all_users[id]);
});

const user_friends = compute((id: string) => {
    const current_user = user(id).get();
    const friends = current_user?.friends?.map((friend_id) => {
        user(friend_id).get();
    });
    return friends;
});

const User = ({ id }: { id: string }) => {
    const current_user = useStore(user(id));
    const friends = useStore(user_friends(id));

    if (!current_user) {
        return null;
    }

    return (
        <div>
            <h2>{current_user.name}</h2>
            <h3>Friends</h3>
            <ul>
                {friends?.map((friend) => (
                    <li>{friend.name}</li>
                ))}
            </ul>
        </div>
    );
};
```

## `store<T>(value: T)`

A writable primitive store.

```typescript
const users = store({
    "user-1": {
        name: "Foo",
        date_of_birth: 2000,
    },
    ...
});
```

Get all users:

```typescript
const all_users = computed((id: string) => {
    return users.get();
});
```

Select a user:

```typescript
const user = computed((id: string) => {
    return users.select((all) => all[id]);
});
```

Note: The select callback should be cheap because it may be called every time there's a data change. The return value is used to check if the selected dependency has changed. Array filter should not be used in the select function because it always returns a different reference.

The store value can be updated from anywhere:

```typescript
function add_user(id: string, user: User) {
    const all = users.get();
    users.set({ ...users, [id]: user });
}
```

From a computed store:

```typescript
const user = computed((id: string) => {
    const current_user = users.select((all) => all[id]);
    if (current_user.date_of_birth >= 2000) {
        // Delete user
        const new_users = { ...users.get() };
        delete new_users[id];
        users.set(new_users);
        return;
    }
    return current_user;
});
```

From an effect:

```typescript
effect(() => {
    const new_users = { ...users.get() };
    let changed = false;
    Object.entries(new_users).forEach((id, user) => {
        if (user.score < 0) {
            delete all[id];
            changed = true;
        }
    });
    if (changed) {
        users.set(new_users);
    }
});
```

Primitive store updates performed inside a reactive block (computed store or effect) are batched at the end of the compute cycle (after all computed stores and effects finished).

If a store is set multiple times in a the same write cycle, only the last set is called.

```typescript
const count = store(0);
effect(() => {
    const current_count = count.get();
    count.set(current_count + 1); // Ignored
    count.set(current_count + 2);
});
```

Note: Setting a store value inside a reactive block is discouraged. If the same store is set from multiple reactive blocks, it could introduce a race condition.

## `compute<P extends Param, T>(cb: (param: P) => T)`

A reactive store that is computed from primitive stores or other computed stores. The dependencies are tracked automatically. The callback must be synchronous. Calling `my_store.get()` or `my_store.select()` outside the synchronous block won't add the store as a dependency. A computed store also has `get()` method to get the entire value and `select()` method to get a subset of the value.

```typescript
const user_age = compute((id: string) => {
    const date_of_birth = user(id).select((u) => u.date_of_birth);
    if (date_of_birth === undefined) {
        return;
    }
    new Date.getFullYear() - date_of_birth;
});
```

When there's a circular dependency, `get()` and `select()` throw an error, and it should be catch.

```typescript
const x = compute(() => {
    try {
        return x().get();
    } catch {
        return 0;
    }
});
// x().get() === 0;
```

Computed stores are removed from the cache shortly after it has no subscriber.

## `effect(cb: () => void)`

A function that is called every time its current dependencies change.

```typescript
effect(() => {
    // This function is called every time users and orders change.
    const all_users = users.get();
    const all_orders = orders.get();
    console.log("users", all_users);
    console.log("orders", all_orders);
});
```

`effect` can be used to sync a store with an external store, e.g local storage.

```typescript
const stored_settings = localStorage.getItem("settings");
const init_settings = stored_settings
    ? JSON.parse(stored_settings)
    : DEFAULT_SETTINGS;
const settings = store(init_settings);
let last_value_from_storage = init_settings;

addEventListener("storage", (e) => {
    if (e.key === "settings" && e.newValue) {
        try {
            const new_value = JSON.parse(e.newValue);
            settings.set(new_value);
        } catch {
            const current = settings.get();
            localStorage.setItem("settings", JSON.stringify(current));
        }
    }
});

effect(() => {
    const current = settings.get();
    if (current !== last_value_from_storage) {
        localStorage.setItem("settings", JSON.stringify(current));
    }
});
```

## `query<P: Param, T>(loader: (param: P) => Promise<T>, opts?: QueryOptions)`

A primitive store which is updated automatically with the return value of the loader. Initially a query is in a "pending" state until the `loader` resolves. `loader` is not a reactive block. So if you use other stores in the loader function, it won't get updated when the stores change.

```typescript
const user = query((id: string) => {
    return fetch(`/users/${id}`);
});
```

A query can be in one of these three states:

```typescript
export interface QueryPending {
    status: "pending";
}

export interface QueryError {
    status: "error";
    error: unknown;
}

export interface QueryFinished<T> {
    status: "finished";
    value: T;
}

export type QueryState<T> = QueryPending | QueryError | QueryFinished<T>;
```

A query is updated every `opts.update_every` milliseconds when it has at least one subscriber. It's destroyed (removed from the cache) after it has no subscriber for `opts.destroy_after` milliseconds. If you use a query that has been destroyed, it will start from a "pending" state again.

A query value can be set manually:

```typescript
user("user-1").set({
    name: "Foo",
});
```

A query can be refreshed manually:

```typescript
user("user-1").load();
```

## `batch(cb: () => void)`

Update multiple stores at once.

If you update multiple stores like this

```typescript
function update() {
    store_a.set(1);
    store_b.set(1);
}
```

A computed store or an effect that depends on `store_a` and `store_b` directly or indirectly will be recomputed twice.

You can use `batch()` to not trigger multiple recomputes to subscribers.

```typescript
function update() {
    batch(() => {
        store_a.set(1);
        store_b.set(1);
    });
}
```

If you call `get()` after `set()`, you'll get the old value because the update is deferred.

```typescript
batch(() => {
    const a = store_a.get(); // 1
    store_a.set(a + 1);
    store_a.get(); // Still 1
});
```

## Mesin VS Jotai

I love Jotai. It’s an improvement over Zustand, which I also loved. But it has some flaws which inspired me to create Mesin.

### Atom family

```typescript
const filteredPostsAtom = atomFamily((param: { category: string; author: string }) => atom((get) => { ... }));
```

The good thing about atom family is that it caches the value. If we’re using the same atom family with the same parameter, it will be computed only once. But atom family has a memory leak issue. It creates an atom for every parameter we use and stores them in a map. The unused atoms never get removed from the map. Thus the map only grows as the application uses the atom family with different parameters.

We can remove the cache items manually based on the creation timestamp, but we don’t know which one is no longer being used.

The parameters are used as the keys for the map. If we're using object parameters, they usually have different object references. Thus it never gets the value from the cache, instead, it creates a new atom each time we use it

Jotai provides a workaround for this issue by allowing us to use a custom deep equal function to compare the parameter with the cache keys. The problem with this is that it runs the deep equal function for every cache key, or until it finds a match.

Mesin serializes the computed store parameters with a fast serializer. So we can use object parameters without scanning the cache keys.

### Atom generator

```typescript
const filteredPostsAtom = (category: string, author: string) => atom((get) => { ... })
```

With atom generator, we don’t have a memory leak issue because after it’s not being used (referenced) it’s automatically garbage-collected by the Javascript runtime. But we don’t get the benefit of using cache because every time we call `filteredPostsAtom()` it generates a new atom. Thus if we use `filteredPostsAtom` with the same parameter in multiple places (components or other computed atoms), Jotai will recompute the value multiple times.

### Async vs sync

Jotai supports async atoms. Most of the time we create an async atom because it (or its dependency) fetches some data. Often it also has dependencies. Every time the dependencies change we may end up fetching the same data.

Mesin has a query store that is meant for data fetching or other async stuff. I aspire to add some features of react query into it but without dealing with keys. Computed stores that depend on a query are still synchronous, thus they work more predictably. While Jotai’s async atoms may suffer from race conditions. For example, the previous computation may still run and add new dependencies.

### Circular dependency

The benefit of using an atomic state management system is that the dependency chain is dynamic. But it can create a dependency cycle. For example, in a spreadsheet application users may create a formula in column “A1” that references column “A2” (`=SUM(A2,A3)`). While at the same time column “A2” is computed from column “A1” (`=MAX(A1,A3)`).

With Jotai we may end up with infinite recursion until the application crashes. On the other hand, Mesin throws an error when it detects a dependency cycle. We only need to catch this error in computed stores that potentially create a dependency cycle.

### Centralized store vs decentralized store

We can think of Jotai’s atom as a key to value in a centralized store. The synchronization is done by the store. So if we want to use or set an atom value outside of the React lifecycle, we have to use the store API.

```typescript
const myStore = createStore();
myStore.get(filteredPostsAtom);
```

Mesin’s stores manage the data directly. It has a manager that synchronizes the updates. But it’s an implementation detail that users don’t need to deal with. So we can get the value of a store outside of React components directly from the store itself.

```typescript
filteredPosts.get();
```

### Signal vs getter function

Mesin automatically detects subscriptions using signal. So getting a store value from outside of the reactive block, e.g. in a `setTimout` callback, won’t add that store as a dependency for that computed store or effect.

Jotai uses a getter function to get the value and subscribe to an atom. We can pass it to a `setTimeout` callback or an async function and it will add the atom that is called with as a dependency even after the computed atom has resolved.
