import type { Param } from "./types";
const tildeRegex = /~/g;

/**
 * Escape a string into its stable key form. Tildes are the only escape
 * character, so skip the regex scan entirely when the string has none — the
 * common case for real-world keys.
 */
const stringifyString = (input: string): string => {
    if (input.indexOf("~") === -1) {
        return `~${input}~`;
    }
    return `~${input.replace(tildeRegex, "~~")}~`;
};

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

    // `typeof` is read once: this function runs on every keyed compute/query
    // lookup, so the primitive branches are ordered by expected frequency.
    const type = typeof input;

    if (type === "number") {
        return String(input);
    }

    if (type === "string") {
        return stringifyString(input as string);
    }

    if (type === "boolean") {
        return input ? "T" : "F";
    }

    if (Array.isArray(input)) {
        // Concatenate directly instead of building an intermediate array and
        // joining it — one fewer allocation per array param.
        let result = "[";
        for (let i = 0; i < input.length; i++) {
            if (i > 0) {
                result += ",";
            }
            result += stringify(input[i]);
        }
        return result + "]";
    }

    if (type === "object") {
        const keys = Object.keys(input as object).sort();
        let result = "{";
        let first = true;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = (input as { [key: string]: Param })[key];
            if (value === undefined) {
                continue;
            }
            if (!first) {
                result += ",";
            }
            result += `${stringifyString(key)}:${stringify(value)}`;
            first = false;
        }

        return result + "}";
    }

    return "";
};
