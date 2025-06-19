import type { Param } from "./types";

/**
 * Create a stable string from `Param`.  The returned string may not be parsed
 * with `JSON.parse()`.
 */
export const stringify = (input: Param): string => {
    if (input === undefined) {
        return "_";
    }

    if (input === null) {
        return "*";
    }

    if (input === true) {
        return "T";
    }

    if (input === false) {
        return "F";
    }

    if (typeof input === "number") {
        return `${input}`;
    }

    if (typeof input === "string") {
        return `~${input.replace("~", "~~")}~`;
    }

    if (Array.isArray(input)) {
        return `[${input.map((i) => stringify(i)).join(",")}]`;
    }

    if (typeof input === "object") {
        const keys = Object.keys(input).sort();
        const props: string[] = [];

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = input[key];
            const stableKey = stringify(key);
            const stableValue = stringify(value);
            if (value !== undefined) {
                props.push(`${stableKey}:${stableValue}`);
            }
        }

        return `{${props.join(",")}}`;
    }

    return "";
};
