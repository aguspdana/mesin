import { expect, test, vi } from "vitest";
import { storeInStorage } from "./storeInStorage";
import { effect } from "./effect";

test("StoreInStorage should initialize with storage value", () => {
    const mockStorage = new LocalStorageMock("initial");
    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
    });

    expect(store.get()).toBe("initial");
});

test("StoreInStorage should update storage when setting value", () => {
    const mockStorage = new LocalStorageMock("initial");
    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
    });

    store.set("updated");

    expect(store.get()).toBe("updated");
    expect(mockStorage.get()).toBe("updated");
});

test("StoreInStorage should react to external storage changes via listener", () => {
    const mockStorage = new LocalStorageMock("initial");
    const store = storeInStorage({
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

test("StoreInStorage should not trigger the external storage listener when setting value locally", () => {
    // This is depend on the implementation of the external storage.
    // This test is to simulate LocalStorage.
    // If the storage has no way to differentiate between local and external updates,
    // the external should not be updated when reacting to external storage changes.
    const mockStorage = new LocalStorageMock("initial");
    const listenerFn = vi.fn();

    const store = storeInStorage({
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

test("StoreInStorage selector should work correctly", () => {
    const mockStorage = new LocalStorageMock({ count: 5, name: "test" });
    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: { count: number; name: string }) => mockStorage.set(value),
    });

    expect(store.select((data) => data.count)).toBe(5);
    expect(store.select((data) => data.name)).toBe("test");
    expect(store.select((data) => data.count * 2)).toBe(10);
});

test("StoreInStorage should handle multiple external updates", () => {
    const mockStorage = new LocalStorageMock(0);
    const store = storeInStorage({
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

test("StoreInStorage should notify subscribers count if provided", () => {
    const mockStorage = new LocalStorageMock("test");
    const notifyFn = vi.fn();

    const store = storeInStorage({
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

test("StoreInStorage should handle complex object updates", () => {
    interface User {
        id: number;
        name: string;
        active: boolean;
    }

    const initialUser: User = { id: 1, name: "John", active: true };
    const mockStorage = new LocalStorageMock(initialUser);

    const store = storeInStorage({
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

test("StoreInStorage should automatically cleanup listener when no more subscribers", () => {
    const mockStorage = new LocalStorageMock("test");
    const cleanupFn = vi.fn();
    const listenFn = vi.fn((callback: (value: string) => void) => {
        mockStorage.listen(callback);
        return cleanupFn; // Return cleanup function
    });

    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: listenFn,
    });

    // Initially no subscribers, cleanup should not be called yet
    expect(cleanupFn).not.toHaveBeenCalled();

    // Create a subscription via effect
    const dispose = effect(() => {
        store.get();
    });

    // Listen function should have been called to set up the listener
    expect(listenFn).toHaveBeenCalledTimes(1);
    // Cleanup should still not be called
    expect(cleanupFn).not.toHaveBeenCalled();

    // Dispose the subscription - this should trigger cleanup
    dispose();

    // Now cleanup should have been called automatically
    expect(cleanupFn).toHaveBeenCalledTimes(1);
});

test("StoreInStorage should only cleanup once when multiple subscriptions are disposed", () => {
    const mockStorage = new LocalStorageMock("test");
    const cleanupFn = vi.fn();
    const listenFn = vi.fn((callback: (value: string) => void) => {
        mockStorage.listen(callback);
        return cleanupFn;
    });

    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: listenFn,
    });

    // Create multiple subscriptions
    const dispose1 = effect(() => {
        store.get();
    });

    const dispose2 = effect(() => {
        store.get();
    });

    // Listen function should have been called once
    expect(listenFn).toHaveBeenCalledTimes(1);
    expect(cleanupFn).not.toHaveBeenCalled();

    // Dispose first subscription - cleanup should NOT be called yet
    dispose1();
    expect(cleanupFn).not.toHaveBeenCalled();

    // Dispose second subscription - NOW cleanup should be called
    dispose2();
    expect(cleanupFn).toHaveBeenCalledTimes(1);
});

test("StoreInStorage should not cleanup if listener doesn't return cleanup function", () => {
    const mockStorage = new LocalStorageMock("test");
    const listenFn = vi.fn((callback: (value: string) => void) => {
        mockStorage.listen(callback);
        // Don't return cleanup function
    });

    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: listenFn,
    });

    // Create and dispose subscription
    const dispose = effect(() => {
        store.get();
    });

    expect(listenFn).toHaveBeenCalledTimes(1);

    dispose();

    effect(() => {
        store.get();
    });

    // Listener should not be set up again
    expect(listenFn).toHaveBeenCalledTimes(1);
});

test("StoreInStorage should properly cleanup MockStorage listeners", () => {
    const mockStorage = new LocalStorageMock("test");

    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: (callback: (value: string) => void) =>
            mockStorage.listen(callback),
    });

    // Listener should not be set up immediately when there's no subscriber
    expect(mockStorage.getListenerCount()).toBe(0);

    // Create subscription - listener count should remain the same
    const dispose = effect(() => {
        store.get();
    });

    // Should still have 1 listener (no additional listeners added)
    expect(mockStorage.getListenerCount()).toBe(1);

    // Dispose subscription - this should remove the listener when no more subscribers
    dispose();

    // Should have 0 listeners after cleanup
    expect(mockStorage.getListenerCount()).toBe(0);
});

test("MockStorage cleanup should prevent triggering disposed listeners", () => {
    const mockStorage = new LocalStorageMock("initial");

    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: (callback: (value: string) => void) =>
            mockStorage.listen(callback),
    });

    let effectValue: string | undefined;
    const effectFn = vi.fn(() => {
        effectValue = store.get();
    });

    // Create subscription
    const dispose = effect(effectFn);
    expect(effectValue).toBe("initial");
    expect(effectFn).toHaveBeenCalledTimes(1);

    // Dispose subscription
    dispose();

    // External update should NOT trigger the disposed listener
    mockStorage.setFromExternalContext("external");

    // Effect should not have been called again
    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(effectValue).toBe("initial"); // Should remain unchanged
    expect(mockStorage.getListenerCount()).toBe(0);
});

test("StoreInStorage should re-establish listener after all subscribers have left", () => {
    const mockStorage = new LocalStorageMock("test");
    const cleanupFn = vi.fn();
    const listenFn = vi.fn((callback: (value: string) => void) => {
        mockStorage.listen(callback);
        return cleanupFn;
    });

    const store = storeInStorage({
        get: () => mockStorage.get(),
        set: (value: string) => mockStorage.set(value),
        listen: listenFn,
    });

    // First subscription
    const dispose1 = effect(() => {
        store.get();
    });
    expect(listenFn).toHaveBeenCalledTimes(1);

    // Dispose
    dispose1();
    expect(cleanupFn).toHaveBeenCalledTimes(1);

    // New subscription
    const dispose2 = effect(() => {
        store.get();
    });

    // Listener should be set up again
    expect(listenFn).toHaveBeenCalledTimes(2);

    dispose2();
});

test("StoreInStorage should not cause infinite loop with storage that always notifies", () => {
    const mockStorage = new URLSearchParamsMock("initial");
    const setSpy = vi.spyOn(mockStorage, "set");

    const store = storeInStorage({
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

    // This set will update the storage, which will trigger the listener.
    // The store should be smart enough not to trigger another set to the storage.
    store.set("updated");

    expect(store.get()).toBe("updated");
    expect(mockStorage.get()).toBe("updated");
    expect(effectValue).toBe("updated");

    // 1. Initial effect run
    // 2. store.set("updated") -> updates store value -> triggers effect
    // The listener in storeInStorage will also be called, which updates the store value again.
    // But since the value is the same ("updated"), it shouldn't trigger another effect run.
    expect(effectFn).toHaveBeenCalledTimes(2);
    expect(setSpy).toHaveBeenCalledTimes(1);
});

// Mock storage that only notify listeners when set from external context
class LocalStorageMock<T> {
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
    // Returns a cleanup function to remove the listener
    listen(callback: (value: T) => void): () => void {
        this.listeners.add(callback);

        // Return cleanup function that removes the listener
        return () => {
            this.listeners.delete(callback);
        };
    }

    // Simulate setting value from a different context (different tab)
    // This should trigger listeners in the current tab
    setFromExternalContext(value: T): void {
        this.value = value;
        this.listeners.forEach((listener) => listener(value));
    }

    // Helper method to check how many listeners are currently active
    getListenerCount(): number {
        return this.listeners.size;
    }
}

// Mock storage that always notifies listeners on set
class URLSearchParamsMock<T> {
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
        // Always notify listeners, simulating URLSearchParams behavior
        this.listeners.forEach((listener) => listener(value));
    }

    listen(callback: (value: T) => void): () => void {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    }
}
