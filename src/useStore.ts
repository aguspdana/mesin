import { useEffect, useRef, useState } from "react";
import { Computed } from "./computed";
import { effect } from "./effect";
import { Query } from "./query";
import { Store } from "./store";
import type { NotPromise, Param, QueryState } from "./types";

export function useStore<T extends NotPromise<unknown>>(
    store: Query<Param, T>
): QueryState<T>;

export function useStore<T extends NotPromise<unknown>>(
    store: Store<NotPromise<T>> | Computed<Param, T>
): T;

export function useStore<T extends NotPromise<unknown>>(
    store: Store<T> | Computed<Param, T> | Query<Param, T>
) {
    const [, setCount] = useState(0);
    const store_ref = useRef<Store<T> | Computed<Param, T> | Query<Param, T>>();
    const value_ref = useRef<T | QueryState<T>>();

    if (store !== store_ref.current) {
        store_ref.current = store;
        value_ref.current = store.get();
    }

    useEffect(() => {
        const dispose = effect(() => {
            const value = store.get();
            if (value_ref.current !== value) {
                setCount((c) => c + 1);
                value_ref.current = value;
            }
        });
        return dispose;
    }, [store]);

    return value_ref.current;
}
