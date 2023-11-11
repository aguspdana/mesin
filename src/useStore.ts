import { useEffect, useRef, useState } from "react";
import { Store } from "./store";
import { NotPromise, Param, QueryState } from "./types";
import { effect } from "./effect";
import { Computed } from "./computed";
import { Query } from "./query";

export function useStore<T extends NotPromise<unknown>>(store: Query<Param, T>): QueryState<T>;

export function useStore<T extends NotPromise<unknown>>(store: Store<NotPromise<T>> | Computed<Param, T>): T;

export function useStore<T extends NotPromise<unknown>>(store: Store<T> | Computed<Param, T> | Query<Param, T>) {
	const [, setCount] = useState(0);
	const store_ref = useRef<Store<T> | Computed<Param, T> | Query<Param, T>>();
	const value_ref = useRef<T | QueryState<T>>();

	if (store !== store_ref.current) {
		store_ref.current = store;
		value_ref.current = store.get();
	}

	useEffect(() => {
		let should_update = false;
		const dispose = effect(() => {
			const value = store.get();
			if (should_update && value_ref.current !== value) {
				value_ref.current = value;
				setCount((c) => c + 1);
			}
		});
		should_update = true;

		return () => dispose();
	}, [store]);

	return value_ref.current;
}
