# Code Style Guide

This guide documents the conventions used throughout [`src/`](src/). It is
descriptive: every rule below reflects patterns already established in the
codebase. New code should match it so the library stays internally consistent.

## Tooling

- **Language:** TypeScript, `strict` mode. `noUnusedLocals`,
  `noUnusedParameters`, and `noFallthroughCasesInSwitch` are all on — code must
  compile with zero unused symbols.
- **Lint:** ESLint (`eslint:recommended` + `@typescript-eslint/recommended` +
  `react-hooks`). `npm run lint` must pass with `--max-warnings 0`.
- **Test:** Vitest. `npm run test` runs the suite; `npm run prepare` runs tests
  then builds, so tests must be green before publishing.
- **Build:** `tsup` bundles `src/index.ts`. The package is `sideEffects: false`,
  so avoid module-level side effects except where deliberately required (see
  [History patching](#module-level-side-effects)).

## Formatting

- **Indentation:** 4 spaces. No tabs.
- **Quotes:** double quotes (`"./manager"`).
- **Semicolons:** always.
- **Trailing commas:** on multi-line literals, params, and type members.
- **Line width:** wrap around ~80 columns. Break long generic signatures and
  call arguments across multiple lines:

  ```ts
  export const compute = <P extends Param, T extends NotPromise<unknown>>(
      cb: (param: P) => T
  ) => {
  ```

- **Braces:** always use braces, even for single-statement guard clauses:

  ```ts
  if (value === this.value) {
      return;
  }
  ```

## Naming

| Kind | Convention | Examples |
| --- | --- | --- |
| Classes | `PascalCase` | `Store`, `Manager`, `Computed`, `Query`, `StoreInStorage` |
| Factory functions | `camelCase`, mirrors its class | `store`, `compute`, `query`, `storeInStorage` |
| Functions & variables | `camelCase` | `unsubscribeAll`, `scheduleUpdate`, `loadId` |
| Types & interfaces | `PascalCase` | `Selector`, `QueryState`, `Dependency` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `MANAGER`, `DEFAULT_QUERY_OPTIONS`, `REMOVE_FROM_REGISTRY_AFTER` |
| Files | `camelCase.ts`, tests as `*.test.ts` | `storeInStorage.ts`, `store.test.ts` |

- Numeric literals for large values use underscores: `5 * 60_000`, `300_000`.
- Boolean fields/vars read as predicates: `isLoading`, `isComputing`,
  `isListening`, `shouldAutoload`.
- Cancel/cleanup handles are named `cancel*` / `stop*` / `dispose` /
  `unsubscribe`.

## The factory-function pattern

Every public primitive is a `class` paired with a lowercase factory function
that is the actual export. The class name is generally kept internal; users call
the factory.

```ts
export class Store<T> { /* ... */ }

export const store = <T>(value: T) => {
    return new Store(value);
};
```

- Export the **factory** from [`index.ts`](src/index.ts), not the constructor.
- Export a class directly only when its type is part of the public API
  (`CircularDependencyError`, or types consumed by `useStore`).

## Arrow functions vs `function`

Default to **arrow functions assigned to `const`** for everything: factories,
helpers, and callbacks.

```ts
export const schedule = (cb: () => void, duration: number) => {
    const timeout = setTimeout(cb, duration);
    return () => clearTimeout(timeout);
};
```

Reach for a `function` declaration/expression only when an arrow can't express
what you need. There are exactly two such cases in the codebase:

- **Overloaded signatures** — a function with multiple call signatures uses
  `function` declarations ([`useStore`](src/useStore.ts)).
- **Dynamic `this`** — when the runtime supplies `this`, use a `function`
  expression and type the receiver, e.g. the history patch in
  [`storeInQueryString.ts`](src/storeInQueryString.ts):

  ```ts
  history[type] = function (this: History, ...args) { /* ... */ };
  ```

## Registry pattern

Keyed, cached instances (`compute`, `query`) follow the same shape: a
`Map<string, T>` keyed by [`stringify(param)`](src/stringify.ts), with a
`removeFromRegistry` callback handed to each instance so it can evict itself.

```ts
export const query = <P extends Param, T>(
    loader: (param: P) => Promise<T>,
    options?: Partial<QueryOptions>
) => {
    const registry = new Map<string, Query<P, T>>();

    return (param: P) => {
        const key = stringify(param);
        const existingQuery = registry.get(key);
        if (existingQuery) {
            return existingQuery;
        }
        const removeFromRegistry = () => {
            registry.delete(key);
        };
        const newQuery = new Query({ param, loader, removeFromRegistry, options });
        registry.set(key, newQuery);
        return newQuery;
    };
};
```

## Cancellation & cleanup

Anything that schedules work or subscribes returns a function that undoes it.
This is the codebase's core resource-management idiom.

- [`schedule(cb, duration)`](src/utils.ts) returns a canceller; never call
  `setTimeout` directly in feature code.
- Store the canceller in a nullable field, and have that field's replacement
  null itself out when fired:

  ```ts
  const cancel = schedule(this.removeFromRegistry, duration);
  this.cancelRemoval = () => {
      cancel();
      this.cancelRemoval = null;
  };
  ```

- `listen`/`subscribe`-style callbacks return their own teardown function.
- Invoke optional cancellers defensively with optional chaining:
  `this.cancelUpdate?.()`.

## TypeScript conventions

- **`interface` vs `type`:** use `interface` for named object shapes
  (`Context`, `Subscriber`, `Dependency`, `QueryOptions`); use `type` for unions,
  aliases, and function signatures (`Selector`, `QueryState`, `UpdateFn`,
  `Param`).
- **Generics carry constraints.** Params are constrained to the domain types:
  `<P extends Param, T extends NotPromise<unknown>>`. Reuse the shared constraint
  types rather than inventing new ones.
- **Prefer `unknown` over `any`.** `Subscriber<T, unknown>`,
  `Store<unknown>`, `catch (error) { ... error: unknown }`. `any` does not
  appear in the codebase.
- **Type-only imports use `import type`:**

  ```ts
  import { Store } from "./store";
  import type { ComputeFn, Context, Param, UpdateFn } from "./types";
  ```

- **Function overloads** for APIs whose return type depends on the argument —
  see the three `useStore` signatures in [`useStore.ts`](src/useStore.ts).
- **Multiple constructor args** are passed as a single named-props object once
  there are more than two (`Query`, `StoreInStorage`), destructured at the top of
  the body. Few args stay positional (`Store`, `Computed`).

## Import ordering

1. External packages first (e.g. `react`).
2. Then relative imports, sorted alphabetically by module path.
3. Named imports within `{ }` are alphabetized.

```ts
import { useEffect, useRef, useState } from "react";
import type { Computed } from "./computed";
import { effect } from "./effect";
import type { Query } from "./query";
import type { NotPromise, Param, QueryState } from "./types";
```

## Control flow

- **Guard clauses / early returns** over nested `if`. Handle the exit case first,
  then continue at the base indentation level.
- **Loops:** use classic indexed `for` loops in hot paths
  ([`unsubscribeAll`](src/utils.ts), [`stringify`](src/stringify.ts),
  batch flushing in [`manager.ts`](src/manager.ts)); use `for...of` when
  iterating `Map` values for readability (`this.subscribers.values()`).
- **Optional callbacks** are always called through optional chaining:
  `this.onSubscriptionChange?.(this.subscribers.size)`.

## SSR / environment guards

The library must run on the server. Guard every browser API behind a `window`
check and provide a sensible default when it is absent.

```ts
get: () => {
    if (typeof window === "undefined") {
        return defaultValue;
    }
    return parse(window.localStorage.getItem(key) ?? "");
},
```

Register and **tear down** every DOM event listener (`addEventListener` paired
with a returned `removeEventListener`).

## Errors

- Custom errors extend `Error` and set `this.name` explicitly:

  ```ts
  export class CircularDependencyError extends Error {
      constructor(msg: string) {
          super(msg);
          this.name = "CircularDependencyError";
      }
  }
  ```

- When catching, type the binding as `unknown` and propagate it, rather than
  assuming `Error`. Where a caught value is intentionally ignored, leave a
  `// Do nothing` comment so the empty block reads as deliberate.

## Comments

- **JSDoc (`/** ... */`)** for exported behavior, tunable constants, and each
  field of an options object — describe the effect and the default:

  ```ts
  /**
   * Delete the query from the cache after there's no subscriber for `n`
   * milliseconds. Default 300_000.
   */
  removeAfter: number;
  ```

- **Inline comments explain *why*, not *what*** — e.g. `// Invalidate pending
  fetch.`, or the block above the history monkey-patch explaining the custom
  event name.
- Annotate magic numbers with units: `export const REMOVE_FROM_REGISTRY_AFTER =
  1000; // milliseconds`.

## Module-level side effects

Avoid them (the package is `sideEffects: false`). The one deliberate exception,
history patching in [`storeInQueryString.ts`](src/storeInQueryString.ts), shows
how to do it safely when unavoidable:

- Guard with `typeof window !== "undefined"`.
- Guard against double-application with a global flag
  (`window.__mesin_history_patched__`).
- Namespace custom events (`mesin:pushstate`) to avoid collisions.

## Tests

- Colocated as `*.test.ts` next to the source file.
- Vitest, importing exactly what's needed: `import { expect, test, vi } from "vitest"`.
- Test names are full descriptive sentences of the expected behavior:
  `test("Query should be in error state after the fetcher throws an error", ...)`.
- Use `vi.fn()` to assert call counts (`expect(effectCb).toHaveBeenCalledTimes(2)`)
  — reactivity correctness is measured by *how often* subscribers run.
- Drive async timing with the [`sleep`](src/utils.ts) helper, not real timers by
  hand.
- Match reactive state with `toMatchObject` for partial shape assertions.

## Public API surface

[`index.ts`](src/index.ts) is a flat barrel of named exports, sorted
alphabetically, re-exporting factory functions (plus `* from "./types"`). Keep it
the single source of truth for what's public — no default exports anywhere.
