import { useEffect, useRef, useState } from "react";
import { Store } from "./store";
import { NotPromise, Param, QueryState } from "./types";
import { effect } from "./effect";
import { Computed } from "./computed";
import { Query } from "./query";

export function useStore<T extends NotPromise<unknown>>(store: Query<Param, T>): QueryState<T>;

export function useStore<T extends NotPromise<unknown>>(store: Store<NotPromise<T>> | Computed<Param, T>): T;

export function useStore<T extends NotPromise<unknown>>(store: Store<T> | Computed<Param, T> | Query<Param, T>) {
	const init = store.get();
	const [, setCount] = useState(0);
	const should_update = useRef(false);

	useEffect(() => {
		should_update.current = false;

		const dispose = effect(() => {
			store.get();
			if (should_update.current) {
				setCount((c) => c + 1);
			}
		});

		should_update.current = true;

		return () => dispose();
	}, [store])

	return init;
}
