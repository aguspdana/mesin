export function schedule(cb: () => void, duration: number) {
	const timeout = setTimeout(cb, duration);
	return () => clearTimeout(timeout);
}
