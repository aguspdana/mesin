export const schedule = (cb: () => void, duration: number) => {
    const timeout = setTimeout(cb, duration);
    return () => clearTimeout(timeout);
};

export const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
