export function schedule(cb: () => void, duration: number) {
    const timeout = setTimeout(cb, duration);
    return () => clearTimeout(timeout);
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
