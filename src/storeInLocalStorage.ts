import { storeInStorage } from "./storeInStorage";

export const storeInLocalStorage = <T>(
    key: string,
    defaultValue: T,
    parse: (value: string) => T,
    stringify: (value: T) => string
) => {
    return storeInStorage({
        get: () => {
            if (typeof window === "undefined") {
                return defaultValue;
            }
            const stored = window.localStorage.getItem(key);
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
            if (typeof window !== "undefined") {
                localStorage.setItem(key, stringify(value));
            }
        },
        listen: (set) => {
            if (typeof window === "undefined") {
                return;
            }
            const handler = (event: StorageEvent) => {
                if (event.key === key) {
                    if (event.newValue !== null) {
                        try {
                            set(parse(event.newValue));
                        } catch {
                            // Do nothing
                        }
                    } else {
                        // Handle deleted values by setting to defaultValue
                        set(defaultValue);
                    }
                }
            };
            window.addEventListener("storage", handler);

            // Return cleanup function
            return () => {
                window.removeEventListener("storage", handler);
            };
        },
    });
};
