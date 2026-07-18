import { afterEach, expect, test } from "vitest";

// ===========================================================================
// BUG #4 (MEDIUM) — storeInQueryString never resets to the default when the
// URL param is removed.
//
// Its listen handler does `if (value !== null) { set(parse(value)) }`, so when
// the param disappears from the URL (Back/forward to a param-less URL) it
// updates its internal `queryValue` but NEVER calls set() — leaving the store
// at the old value even though get() would return defaultValue for that URL.
// storeInLocalStorage handles the equivalent event by calling set(defaultValue).
//
// This test builds a minimal fake DOM (no jsdom dependency) so storeInQueryString
// can run. It asserts the CORRECT behavior and is EXPECTED TO FAIL until fixed.
// ===========================================================================

function setupFakeDom(search: string) {
    const history = {
        state: { marker: 1 } as unknown,
        pushState(state: unknown) {
            this.state = state;
        },
        replaceState(state: unknown) {
            this.state = state;
        },
    };
    const win = new EventTarget() as EventTarget & {
        location: { search: string; pathname: string; hash: string };
        history: typeof history;
        __mesin_history_patched__?: boolean;
    };
    win.location = { search, pathname: "/", hash: "" };
    win.history = history;
    (globalThis as unknown as { window: unknown }).window = win;
    (globalThis as unknown as { history: unknown }).history = history;
    return win;
}

afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    delete (globalThis as unknown as { history?: unknown }).history;
});

test("BUG#4: removing the URL param resets the store to defaultValue", async () => {
    const win = setupFakeDom("?k=B");

    // Import after the fake DOM exists (module patches history at load time).
    const { storeInQueryString } = await import("./storeInQueryString");
    const { effect } = await import("./effect");

    const s = storeInQueryString<string>(
        "k",
        "default",
        (v) => v,
        (v) => v
    );

    // Seeded from the URL.
    expect(s.get()).toBe("B");

    // Subscribe so storeInQueryString attaches its popstate/history listeners.
    let observed: string | undefined;
    effect(() => {
        observed = s.get();
    });
    expect(observed).toBe("B");

    // Simulate Back navigation to a URL without the param, then fire popstate.
    win.location.search = "";
    win.dispatchEvent(new Event("popstate"));

    // The param is gone, so the store must fall back to the default.
    expect(s.get()).toBe("default");
    expect(observed).toBe("default");
});
