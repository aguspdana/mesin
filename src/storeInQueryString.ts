import { storeInStorage } from "./storeInStorage";

declare global {
    interface Window {
        __mesin_history_patched__?: boolean;
    }
}

// Monkey patch history.pushState and history.replaceState to dispatch an event
// We patch the history object to dispatch events when pushState or replaceState
// are called. This allows us to listen for URL changes and update the store.
// We use a custom event name to avoid conflicts with other libraries.
if (typeof window !== "undefined") {
    // Ensure we don't patch it multiple times
    if (!window.__mesin_history_patched__) {
        for (const type of ["pushState", "replaceState"] as const) {
            const original = history[type];
            const eventName = `mesin:${type.toLowerCase()}`;
            history[type] = function (
                this: History,
                ...args: Parameters<typeof original>
            ) {
                const result = original.apply(this, args);
                const event = new Event(eventName);
                window.dispatchEvent(event);
                return result;
            };
        }
        window.__mesin_history_patched__ = true;
    }
}

export const storeInQueryString = <T>(
    key: string,
    defaultValue: T,
    parse: (value: string) => T,
    stringify: (value: T) => string
) => {
    let queryValue: string | null = null;

    return storeInStorage({
        get: () => {
            if (typeof window === "undefined") {
                return defaultValue;
            }

            const params = new URLSearchParams(window.location.search);
            const stored = params.get(key);
            queryValue = stored;

            if (stored === null) {
                return defaultValue;
            }

            try {
                return parse(stored);
            } catch {
                return defaultValue;
            }
        },
        set: (value) => {
            if (typeof window === "undefined") {
                return;
            }

            const params = new URLSearchParams(window.location.search);
            const isEqual = stringify(value) === stringify(defaultValue);

            if (isEqual) {
                queryValue = null;
                params.delete(key);
            } else {
                queryValue = stringify(value);
                params.set(key, queryValue);
            }

            const searchString = params.toString();
            const query = searchString ? `?${searchString}` : "";
            const newUrl = `${window.location.pathname}${query}${window.location.hash}`;

            window.history.replaceState(window.history.state, "", newUrl);
        },
        listen: (set) => {
            if (typeof window === "undefined") {
                return;
            }

            const handler = () => {
                const params = new URLSearchParams(window.location.search);
                const value = params.get(key);

                if (value === queryValue) {
                    return;
                }

                queryValue = value;

                if (value === null) {
                    set(defaultValue);
                } else {
                    try {
                        set(parse(value));
                    } catch {
                        // Do nothing
                    }
                }
            };

            window.addEventListener("popstate", handler);
            window.addEventListener("mesin:pushstate", handler);
            window.addEventListener("mesin:replacestate", handler);

            // Return cleanup function
            return () => {
                window.removeEventListener("popstate", handler);
                window.removeEventListener("mesin:pushstate", handler);
                window.removeEventListener("mesin:replacestate", handler);
            };
        },
    });
};
