import { useEffect, useRef, useState } from "react";
import { Store } from "./store";
import { NotPromise, Param } from "./types";
import { effect } from "./effect";
import { Computed } from "./computed";

export function useStore<T>(store: Store<NotPromise<T>> | Computed<Param, NotPromise<T>>) {
	const [value, setValue] = useState<NotPromise<T>>(store.get());
	const should_update = useRef(false);

	useEffect(() => {
		should_update.current = false;

		const dispose = effect(() => {
			const newValue = store.get();
			if (should_update.current) {
				setValue(newValue);
			}
		});

		should_update.current = true;

		return () => dispose();
	}, [store])

	return value;
}
