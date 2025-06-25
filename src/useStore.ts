import { useEffect, useRef, useState } from "react";
import type { Computed } from "./computed";
import { effect } from "./effect";
import type { Query } from "./query";
import type { Store } from "./store";
import type { StoreInStorage } from "./storeInStorage";
import type { NotPromise, Param, QueryState } from "./types";

export function useStore<T extends NotPromise<unknown>>(
    store: Query<Param, T>
): QueryState<T>;

export function useStore<T extends NotPromise<unknown>>(
    store: Store<NotPromise<T>> | Computed<Param, T> | StoreInStorage<T>
): T;

export function useStore<T extends NotPromise<unknown>>(store: AnyStore<T>) {
    const [, setCount] = useState(0);
    const storeRef = useRef<AnyStore<T>>();
    const valueRef = useRef<T | QueryState<T>>();

    if (store !== storeRef.current) {
        storeRef.current = store;
        valueRef.current = store.get();
    }

    useEffect(() => {
        const dispose = effect(() => {
            const value = store.get();
            if (valueRef.current !== value) {
                setCount((c) => c + 1);
                valueRef.current = value;
            }
        });
        return dispose;
    }, [store]);

    return valueRef.current;
}

type AnyStore<T> =
    | Store<T>
    | Computed<Param, T>
    | Query<Param, T>
    | StoreInStorage<T>;
