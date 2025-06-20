import { expect, test, vi } from "vitest";
import { storeWithStorage } from "./storeWithStorage";
import { effect } from "./effect";

test("StoreWithStorage should initialize with storage value", () => {
    const mockStorage = new MockStorage("initial");
    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
    });

    expect(store.get()).toBe("initial");
});

test("StoreWithStorage should update storage when setting value", () => {
    const mockStorage = new MockStorage("initial");
    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
    });

    store.set("updated");

    expect(store.get()).toBe("updated");
    expect(mockStorage.get()).toBe("updated");
});

test("StoreWithStorage should react to external storage changes via listener", () => {
    const mockStorage = new MockStorage("initial");
    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: (callback: (value: string) => void) =>
            mockStorage.listen(callback),
    });

    let effectValue: string | undefined;
    const effectFn = vi.fn(() => {
        effectValue = store.get();
    });

    effect(effectFn);
    expect(effectValue).toBe("initial");
    expect(effectFn).toHaveBeenCalledTimes(1);

    // Simulate value change from external context (different tab)
    mockStorage.setFromExternalContext("externalUpdate");

    expect(effectValue).toBe("externalUpdate");
    expect(store.get()).toBe("externalUpdate");
    expect(effectFn).toHaveBeenCalledTimes(2);
});

test("StoreWithStorage should not trigger listener when setting value locally", () => {
    const mockStorage = new MockStorage("initial");
    const listenerFn = vi.fn();

    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: (callback: (value: string) => void) => {
            mockStorage.listen(callback);
            listenerFn(callback);
        },
    });

    let effectValue: string | undefined;
    const effectFn = vi.fn(() => {
        effectValue = store.get();
    });

    effect(effectFn);
    expect(effectValue).toBe("initial");
    expect(effectFn).toHaveBeenCalledTimes(1);

    // Setting value locally should not trigger the external listener
    store.set("localUpdate");

    expect(effectValue).toBe("localUpdate");
    expect(store.get()).toBe("localUpdate");
    expect(mockStorage.get()).toBe("localUpdate");
    expect(effectFn).toHaveBeenCalledTimes(2);

    // The listener should have been registered but not called for local updates
    expect(listenerFn).toHaveBeenCalledTimes(1);
});

test("StoreWithStorage selector should work correctly", () => {
    const mockStorage = new MockStorage({ count: 5, name: "test" });
    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: { count: number; name: string }) => mockStorage.set(value),
    });

    expect(store.select((data) => data.count)).toBe(5);
    expect(store.select((data) => data.name)).toBe("test");
    expect(store.select((data) => data.count * 2)).toBe(10);
});

test("StoreWithStorage should handle multiple external updates", () => {
    const mockStorage = new MockStorage(0);
    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: number) => mockStorage.set(value),
        listen: (callback: (value: number) => void) =>
            mockStorage.listen(callback),
    });

    const values: number[] = [];
    const effectFn = vi.fn(() => {
        values.push(store.get());
    });

    effect(effectFn);
    expect(values).toEqual([0]);

    // Multiple external updates
    mockStorage.setFromExternalContext(1);
    mockStorage.setFromExternalContext(2);
    mockStorage.setFromExternalContext(3);

    expect(values).toEqual([0, 1, 2, 3]);
    expect(effectFn).toHaveBeenCalledTimes(4);
});

test("StoreWithStorage should notify subscribers count if provided", () => {
    const mockStorage = new MockStorage("test");
    const notifyFn = vi.fn();

    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        onSubscriptionChange: notifyFn,
    });

    // Initially no subscribers
    expect(notifyFn).not.toHaveBeenCalled();

    // Create a subscription via effect
    const dispose = effect(() => {
        store.get();
    });

    // Should notify that we have 1 subscriber
    expect(notifyFn).toHaveBeenCalledWith(1);

    // Dispose the subscription
    dispose();

    // Should notify that we have 0 subscribers
    expect(notifyFn).toHaveBeenLastCalledWith(0);
});

test("StoreWithStorage should handle complex object updates", () => {
    interface User {
        id: number;
        name: string;
        active: boolean;
    }

    const initialUser: User = { id: 1, name: "John", active: true };
    const mockStorage = new MockStorage(initialUser);

    const store = storeWithStorage({
        get: () => mockStorage.get(),
        set: (value: User) => mockStorage.set(value),
        listen: (callback: (value: User) => void) =>
            mockStorage.listen(callback),
    });

    let currentUser: User | undefined;
    const effectFn = vi.fn(() => {
        currentUser = store.get();
    });

    effect(effectFn);
    expect(currentUser).toEqual(initialUser);

    // Local update
    const updatedUser = { id: 1, name: "Jane", active: false };
    store.set(updatedUser);
    expect(currentUser).toEqual(updatedUser);
    expect(mockStorage.get()).toEqual(updatedUser);

    // External update
    const externalUser = { id: 2, name: "Bob", active: true };
    mockStorage.setFromExternalContext(externalUser);
    expect(currentUser).toEqual(externalUser);
    expect(store.get()).toEqual(externalUser);
});

// Mock storage implementation that can simulate different contexts (tabs)
class MockStorage<T> {
    private value: T;
    private listeners: Set<(value: T) => void> = new Set();

    constructor(initialValue: T) {
        this.value = initialValue;
    }

    get(): T {
        return this.value;
    }

    set(value: T): void {
        this.value = value;
    }

    // Listen to changes from other contexts (different tabs)
    listen(callback: (value: T) => void): void {
        this.listeners.add(callback);
    }

    // Simulate setting value from a different context (different tab)
    // This should trigger listeners in the current tab
    setFromExternalContext(value: T): void {
        this.value = value;
        this.listeners.forEach((listener) => listener(value));
    }
}
