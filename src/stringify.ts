import type { Param } from './types';

/**
 * Create a stable string from `Param`.  The returned string may not be parsed
 * with `JSON.parse()`.
 */
export function stringify(input: Param): string {
	if (input === undefined) {
		return '_';
	}

	if (typeof input !== 'object' || input === null) {
		return JSON.stringify(input);
	}

	if (Array.isArray(input)) {
		const items = input.map((i) => stringify(i));
		return `[${items.join(',')}]`
	}

	const keys = Object.keys(input).sort();
	const props: string[] = [];

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const value = input[key];
		const stable_key = JSON.stringify(key);
		const stable_value = stringify(value);
		if (value !== undefined) {
			const prop = `${stable_key}:${stable_value}`;
			props.push(prop);
		}
	}

	return `{${props.join(',')}}`;
}