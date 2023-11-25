export type Param =
	| void
	| null
	| string
	| number
	| boolean
	| Param[]
	| { [key: string]: Param };

export type NotPromise<T> = T extends Promise<unknown> ? never : T;

export type Selector<T, V> = (data: T) => V;

export type ComputeFn<P extends Param, V extends NotPromise<unknown>> = (data: P) => V;

export interface Context {
	add_dependency: (dependency: Dependency) => void;
	notify: () => void;
}

export interface Subscriber<T, V> {
	notify: () => void;
	selector: (value: T) => V;
	value: V;
}

export interface Dependency {
	unsubscribe: () => void;
	changed: () => boolean;
}

export type NotifyFn = () => void;

export type UpdateFn = () => NotifyFn;

export interface QueryPending {
	status: 'pending';
}

export interface QueryError {
	status: 'error';
	error: unknown;
}

export interface QueryFinished<T> {
	status: 'finished';
	value: T;
}

export type QueryState<T> = QueryPending | QueryError | QueryFinished<T>;

export interface QueryOptions {
	/**
	 * Update the store every `n` milliseconds when there's a subscriber.
	 */
	update_every: number;
	/**
	 * Delete the query from the cache after there's no subscriber for `n` milliseconds.
	 * When it's used again it will be in "pending" state.
	 */
	remove_after: number;
}