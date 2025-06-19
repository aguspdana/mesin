import { useEffect, useRef, useState } from "react";
import type { Computed } from "./computed";
import { effect } from "./effect";
import type { Query } from "./query";
import type { Store } from "./store";
import type { StoreWithStorage } from "./storeWithStorage";
import type { NotPromise, Param, QueryState } from "./types";

export function useStore<T extends NotPromise<unknown>>(
    store: Query<Param, T>
): QueryState<T>;

export function useStore<T extends NotPromise<unknown>>(
    store: Store<NotPromise<T>> | Computed<Param, T> | StoreWithStorage<T>
): T;

export function useStore<T extends NotPromise<unknown>>(store: AnyStore<T>) {
    const [, setCount] = useState(0);
    const store_ref = useRef<AnyStore<T>>();
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

type AnyStore<T> =
    | Store<T>
    | Computed<Param, T>
    | Query<Param, T>
    | StoreWithStorage<T>;
