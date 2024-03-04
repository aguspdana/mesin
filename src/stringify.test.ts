import { expect, test } from "vitest";
import { stringify } from "./stringify";

test("stringify() should return a stable result", () => {
	expect(stringify(undefined)).toBe("_");
	expect(stringify(null)).toBe("*");
	expect(stringify('"')).toBe('~"~');
	expect(stringify("~")).toBe("~~~~");
	expect(stringify({ b: 1, a: 2 })).toBe("{~a~:2,~b~:1}");
	expect(stringify({ b: undefined, a: 2 })).toBe("{~a~:2}");
	expect(stringify({ b: [3, 1, 2], a: 2 })).toBe("{~a~:2,~b~:[3,1,2]}");
	expect(stringify({ '"': 1 })).toBe('{~"~:1}');
	expect(stringify({ "~": 1 })).toBe("{~~~~:1}");
	expect(stringify([3, 1, 2])).toBe("[3,1,2]");
	expect(stringify([null, 1])).toBe("[*,1]");
	expect(stringify([undefined, 1])).toBe("[_,1]");
	expect(stringify([1, undefined])).toBe("[1,_]");
	expect(stringify([undefined])).toBe("[_]");
	expect(stringify([{b: 1, a: 2 }, 1])).toBe("[{~a~:2,~b~:1},1]");
});
