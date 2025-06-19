import { expect, test, vi } from "vitest";
import { effect } from "./effect";
import { query } from "./query";
import { QueryState } from "./types";
import { sleep } from "./utils";

test("Should initialize the value", async () => {
    const count = query(
        async () => {
            await sleep(10);
            return 1;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    count().init(0);
    let state: QueryState<number> | null = null;
    await sleep(20);
    effect(() => {
        state = count().get();
    });
    expect(state).toMatchObject({ status: "finished", value: 0 });
    await sleep(20);
    expect(state).toMatchObject({ status: "finished", value: 1 });
});

test("Query state should be in finished state after the initial fetch resolved", async () => {
    const count = query(
        async () => {
            await sleep(0);
            return 1;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    let state: QueryState<number> | null = null;
    const effectCb = vi.fn(() => {
        state = count().get();
    });
    effect(effectCb);
    expect(state).toMatchObject({ status: "pending" });

    await sleep(10);
    expect(state).toMatchObject({ status: "finished", value: 1 });

    expect(effectCb).toHaveBeenCalledTimes(2);
});

test("Query should be in error state after the fetcher throws an error", async () => {
    const count = query(
        async () => {
            await sleep(0);
            throw "Ops";
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    let state: QueryState<number> | null = null;
    const effectCb = vi.fn(() => {
        state = count().get();
    });
    effect(effectCb);
    expect(state).toMatchObject({ status: "pending" });

    await sleep(10);
    expect(state).toMatchObject({ status: "error", error: "Ops" });

    expect(effectCb).toHaveBeenCalledTimes(2);
});

test("Should not load when `autoloadOnServer` is false", async () => {
    const count = query(
        async () => {
            await sleep(0);
            return 1;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: false,
        }
    );

    let state: QueryState<number> | null = null;
    effect(() => {
        state = count().get();
    });
    expect(state).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(state).toMatchObject({ status: "pending" });
});

test("Should load when `load()` is called manually despite `autoloadOnServer` is false", async () => {
    const count = query(
        async () => {
            await sleep(0);
            return 1;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: false,
        }
    );

    let state: QueryState<number> | null = null;
    effect(() => {
        state = count().get();
    });
    expect(state).toMatchObject({ status: "pending" });
    count().load();
    await sleep(10);
    expect(state).toMatchObject({ status: "finished", value: 1 });
});

test("Should update every n milliseconds", async () => {
    let source = 1;
    const count = query(
        async () => {
            await sleep(0);
            source += 2;
            return source;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    let state: QueryState<number> | null = null;
    const effectCb = vi.fn(() => {
        state = count().get();
    });
    effect(effectCb);
    expect(state).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(state).toMatchObject({ status: "finished", value: 3 });
    await sleep(30);
    expect(state).toMatchObject({ status: "finished", value: 5 });
    expect(effectCb).toHaveBeenCalledTimes(3);
});

test("Setting the query value should invalidate ongoing fetching and then update after `updateEvery` milliseconds", async () => {
    let source = 1;
    const count = query(
        async () => {
            await sleep(20);
            source += 2;
            return source;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    let state: QueryState<number> | null = null;
    const effectCb = vi.fn(() => {
        state = count().get();
    });
    effect(effectCb);
    expect(state).toMatchObject({ status: "pending" });
    await sleep(10);
    count().set(2);
    expect(state).toMatchObject({ status: "finished", value: 2 });
    await sleep(50);
    expect(state).toMatchObject({ status: "finished", value: 5 });
    expect(effectCb).toHaveBeenCalledTimes(3);
});

test("The query should be destroyed after not subscribed for `removeAfter` milliseconds", async () => {
    let source = 1;
    const count = query(
        async () => {
            await sleep(0);
            source += 2;
            return source;
        },
        {
            updateEvery: 20,
            removeAfter: 20,
            autoloadOnServer: true,
        }
    );

    const destroy = effect(() => count().get());
    expect(count().get()).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(count().get()).toMatchObject({ status: "finished", value: 3 });
    destroy();
    await sleep(30);
    effect(() => count().get());
    expect(count().get()).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(count().get()).toMatchObject({ status: "finished", value: 5 });
});

test("Should not update query when it has no subscriber", async () => {
    let source = 1;
    const count = query(
        async () => {
            await sleep(0);
            source += 2;
            return source;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    const destroy = effect(() => count().get());
    expect(count().get()).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(count().get()).toMatchObject({ status: "finished", value: 3 });
    destroy();
    await sleep(30);
    expect(count().get()).toMatchObject({ status: "finished", value: 3 });
});

test("Should reset and load immediately when there is a subscriber", async () => {
    let source = 1;
    const count = query(
        async () => {
            await sleep(0);
            source += 1;
            return source;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    let state: QueryState<number>;

    const destroy = effect(() => {
        state = count().get();
    });

    expect(state).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(state).toMatchObject({ status: "finished", value: 2 });
    count().reset();
    expect(state).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(state).toMatchObject({ status: "finished", value: 3 });
    destroy();
});

test("Should reset and load after there is a new subscriber", async () => {
    let source = 1;
    const count = query(
        async () => {
            await sleep(0);
            source += 1;
            return source;
        },
        {
            updateEvery: 20,
            removeAfter: 100,
            autoloadOnServer: true,
        }
    );

    const destroy = effect(() => count().get());
    expect(count().get()).toMatchObject({ status: "pending" });
    await sleep(10);
    expect(count().get()).toMatchObject({ status: "finished", value: 2 });
    destroy();
    count().reset();
    expect(count().get()).toMatchObject({ status: "pending" });
    await sleep(30);
    effect(() => count().get());
    await sleep(10);
    expect(count().get()).toMatchObject({ status: "finished", value: 3 });
});
