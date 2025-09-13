import type { Param } from "./types";
const tildeRegex = /~/g;
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
        return String(input);
    }

    if (typeof input === "string") {
        return `~${input.replace(tildeRegex, "~~")}~`;
    }

    if (Array.isArray(input)) {
        const parts = new Array(input.length);
        for (let i = 0; i < input.length; i++) {
            parts[i] = stringify(input[i]);
        }
        return `[${parts.join(",")}]`;
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
