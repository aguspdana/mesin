import { useEffect, useRef, useState } from "react";
import { Computed } from "./computed";
import { effect } from "./effect";
import { Query } from "./query";
import { Store } from "./store";
import type { NotPromise, Param, QueryState } from "./types";

export function useStore<T extends NotPromise<unknown>>(store: Query<Param, T>): QueryState<T>;

export function useStore<T extends NotPromise<unknown>>(store: Store<NotPromise<T>> | Computed<Param, T>): T;

export function useStore<T extends NotPromise<unknown>>(store: Store<T> | Computed<Param, T> | Query<Param, T>) {
	const [, setCount] = useState(0);
	const store_ref = useRef<Store<T> | Computed<Param, T> | Query<Param, T>>();
	const value_ref = useRef<T | QueryState<T>>();
	const dispose_ref = useRef<() => void>();

	if (store !== store_ref.current) {
		store_ref.current = store;
		value_ref.current = store.get();
		let should_update = false;
		dispose_ref.current = effect(() => {
			const value = store.get();
			value_ref.current = value;
			if (should_update && value_ref.current !== value) {
				setCount((c) => c + 1);
			}
		});
		should_update = true;
	}

	useEffect(() => dispose_ref.current, [store]);

	return value_ref.current;
}
