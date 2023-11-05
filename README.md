# Mesin

(Pronounced like _machine_.)

What if Jotai, Recoil, SolidJS's signal, and React Query are mixed together? That's Mesin.

- Dynamic graph state like spreadsheet's state.
- Track dependencies using signal like SolidJS.
- Atoms used in multiple places are computed only once.
- No memory leak.
- Circular dependency can be handled.
- All the goodies of React Query.

## Example

```typescript
const users = store({
	'user-1': {
		name: 'Foo',
		friends: ['user-2'],
	},
	'user-2': {
		name: 'Bar',
		friends: ['user-1'],
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
})

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
	'user-1': {
		name: 'Foo',
		date_of_birth: 2000,
	},
	...
});
```

Get all users:

```typescript
const all_users = computed((id: string) => {
	return users.get();
})
```

Select a user:

```typescript
const user = computed((id: string) => {
	return users.select((all) => all[id]);
})
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
})
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
	console.log('users', all_users);
	console.log('orders', all_orders);
});
```

`effect` can be used to sync a store with an external store, e.g local storage.

```typescript
const stored_settings = localStorage.getItem('settings');
const init_settings = stored_settings
	? JSON.parse(stored_settings)
	: DEFAULT_SETTINGS;
const settings = store(init_settings);
let last_value_from_storage = init_settings;

addEventListener('storage', (e) => {
	if (e.key === 'settings' && e.newValue) {
		try {
			const new_value = JSON.parse(e.newValue);
			settings.set(new_value);
		} catch {
			const current = settings.get();
			localStorage.setItem('settings', JSON.stringify(current));
		}
	}
});

effect(() => {
	const current = settings.get();
	if (current !== last_value_from_storage) {
		localStorage.setItem('settings', JSON.stringify(current));
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
	state: 'pending';
}

export interface QueryError {
	state: 'error';
	error: unknown;
}

export interface QueryFinished<T> {
	state: 'finished';
	value: T;
}

export type QueryState<T> = QueryPending | QueryError | QueryFinished<T>;
```

A query is updated every `opts.update_every` milliseconds when it has at least one subscriber. It's destroyed (removed from the cache) after it has no subscriber for `opts.destroy_after` milliseconds. If you use a query that has been destroyed, it will start from a "pending" state again.

A query value can be set manually:

```typescript
user('user-1').set({
	name: 'Foo',
});
```

A query can be refreshed manually:

```typescript
user('user-1').load();
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
	})
}
```

If you call `get()` after `set()`, you'll get the old value because the update is deferred.

```typescript
batch(() => {
	const a = store_a.get(); // 1
	store_a.set(a + 1);
	store_a.get();           // Still 1
})
```

## Mesin VS Jotai

Jotai has `atomFamily` that can accept a parameter. If you use a non-primitive parameter, the reference must be stable, otherwise it always gets cache-miss. Mesin's computed store is similar to Jotai's `atomFamily`. It can accept any value that can be serialized into a string and it doesn't have to have the same reference.

Jotai's `atomFamily` by default has a memory-leak problem. To avoid it, you need to remove the atoms from the cache manually based only on the parameter and the creation time. Mesin automatically remove unsubscribed computed store from the cache. Thus you won't get memory leak.

Jotai's computed atom can be asynchronous and it could introduce race conditions. Asynchronous atoms also tend to be stale.

```typescript
const a = atom(1);
const b = atom(async (get) => {
	return new Promise((resolve) => {
		setTimeout(() => resolve(get(a) + 1), 1000);
	});
});
// Increment a, and you may get this combination for awhile
// a = 2
// b = 2
```

Usually what forced developers to create async atoms with Jotai is because they fetch data from the internet in the atom. This could waste the api server's resources because the atoms may be recomputed many times and thus make the same request many times.

Mesin doesn't allow asynchronous computed store. All of the async parts must be extracted into queries.

## Mesin VS Recoil

Mesin has much simpler API than Recoil. Also Recoil is no longer maintained.

From the user point of view Jotai and Recoil are pretty similar. So some of the comparison with Jotai also apply to Recoil.

## Mesin VS Preact's Signal

Preact's signal doesn't have parameterized computed signal while Mesin does.
