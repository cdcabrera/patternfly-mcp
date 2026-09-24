# Alternative patch: metadata-first collection registration (Option B)

**Date:** 2026-09-24  
**Status:** Implemented in working tree (not necessarily committed)  
**Related work:** PF-4589 configurable collection metadata; unified `serverCollectionsRegistry`

## Problem statement

Collections are declared as a **4-tuple** `McpCollection`: `[name, config, handler, _config]`. The server registry historically keyed off **successful handler output** (`McpCollectionResult` with `records`). That model breaks down for collections that are:

- **Optional** or non-blocking for startup (`isRequired` unset or false).
- **Delayed** via `_config.runSchedule` (e.g. `delayStartMs`, `repeat: Infinity`).
- **Dual-phase**: rich data from `_config.initial` at startup, with the main handler scheduled much later (e.g. `patternfly-api`).

Consumers that need to know **which collections exist** and **plugin-visible metadata** (`config.title`, etc.) should not have to wait for the first crawl or infer presence from empty record sets.

## Options considered

### Option A — Placeholder records at registration

Register every collection immediately with a synthetic response, e.g. `{ records: [] }`, then replace it when the real handler runs.

| Pros | Cons |
|------|------|
| Minimal type changes; `getServerRecordsRegistry` always returns an object | Misleading semantics: “registered” implies loadable records |
| Listeners fire on first write | Downstream code may treat empty `records` as “loaded but empty catalog” |
| | Hard to distinguish “not yet loaded” vs “loaded with zero results” |
| | Retention / viability logic may interact badly with fake empty updates |

### Option B — Tuple shell registration (chosen)

Register from **general tuple properties** as soon as `registerCollections` runs:

- **`name` (index 0)** — required; becomes the map key.
- **`config` (index 1)** — optional plugin-visible metadata; stored when present.

Defer **`response`** (records) until `_config.initial`, a successful handler invocation, or an explicit `setServerRecordsRegistry` update.

This is an **indirect** fix: it does not special-case `patternfly-api` or scheduled collections; it applies to every tuple in the registration pipeline.

## Chosen design (Option B)

### Registry entry shape

```ts
type ServerCollectionRegistryEntry = {
  response?: McpCollectionResult;
  config?: McpCollectionConfig;
};
```

- **Existence** of a collection: `serverCollectionsRegistry.has(name)` or `getServerCollectionsRegistry({ collectionName }) !== undefined`.
- **Records**: `getServerRecordsRegistry({ collectionName })` → `entry.response` (still `undefined` until hydrated).
- **Metadata**: `getServerCollectionConfigRegistry({ collectionName })` → `entry.config` (undefined if never set).

When `config` is omitted on the tuple, the shell may still exist with an empty object body (e.g. `{ config: {} }` after invalid handler paths that never set `response`).

### Registration pipeline (`registerCollections`)

1. **Step 0 (sync)** — For each tuple, `registerCollectionShell(name, config)` so the name (and config) appear before any `await`.
2. **Step 1** — `_config.initial` hydration via `setServerRecordsRegistry({ name, config, response })`.
3. **Step 2** — Handler execution, scheduled/worker paths, incremental updates.

**Why sync step 0 matters:** An earlier async-only registration yielded before step 1’s `initial` hydrate, so tests (and any synchronous readers) saw no entry between step 0 and step 1. `registerCollectionShell` is intentionally synchronous.

### `setServerRecordsRegistry` merge semantics

- Merges into any existing shell: preserves prior `response` / `config` when new writes omit them.
- **Listeners** (`onUpdateServerRecordsRegistry`) run **only when** the resulting entry has `response !== undefined`.
- Metadata-only updates do not notify listeners (avoids noise and matches `patternFly.getResources`, which only acts when `response` is present).

### Backward compatibility

- `getServerRecordsRegistry` overloads unchanged in spirit: single-name lookup still returns `McpCollectionResult | undefined` (records only).
- Full map access still returns `Map<string, ServerCollectionRegistryEntry>` for retention and loaders.

## Representative use case: `patternfly-api`

- Tuple includes plugin `config` (e.g. title) and `_config.initial` (embedded catalog at $t=0$).
- Scheduled handler may use long `delayStartMs` and `repeat: Infinity`.
- **Before Option B:** registry often had no entry until the first `setServerRecordsRegistry` with a `response`.
- **After Option B:** `patternfly-api` is visible by name immediately after step 0; records appear after `initial` and/or handler updates; metadata is available via `getServerCollectionsRegistry` / `getServerCollectionConfigRegistry` without faking records.

## Integration: PatternFly resources adapter

`patternFly.getResources` remains a thin consumer:

- Subscribes via `onUpdateServerRecordsRegistry`.
- Calls `setPatternFlyCollection(name, response, config)` only when `name && response`.
- Local `patternFlyCollectionConfigRegistry` can hold config per collection without refactoring the legacy aggregator.

No requirement to expose metadata on `getPatternFlyMcpResources` was part of this patch scope.

## Trade-offs and open issues

| Topic | Notes |
|-------|--------|
| **“Registered” vs “has records”** | Callers must use the right API: full entry vs records-only view. |
| **Listener replay** | Shell registration does not replay to listeners; late subscribers still depend on existing replay behavior when `response` eventually arrives. |
| **`registerCollections` await on handlers** | Scheduled handlers with `repeat: Infinity` may still affect when `registerCollections` promise settles; unrelated to Option B but affects `onSettle`. |
| **`onRequired`** | Still driven by required collections with successful registration outcomes; shells alone do not satisfy “has records”. |
| **Invalid handler output** | Shell + `config: {}` may exist; `response` stays undefined (see unit test for invalid records). |

## Verification

Unit tests cover:

- Optional delayed collection: registry has `config` before handler resolves; `getServerRecordsRegistry` undefined until then.
- Invalid collection: shell with `config: {}`, no `response`.
- Unified registry / metadata passed through `onRequired` and registration promises (existing suite).

Full `npm test` (spell, lint, types, 1589 unit tests) passes after Option B + `registerCollectionShell` JSDoc.

## Summary

Option B registers collections using **intrinsic tuple data** (`name` required, `config` optional) without placeholder records. Records and listener notifications stay tied to real `McpCollectionResult` data, which keeps semantics honest for delayed, optional, and dual-phase collections such as the PatternFly API catalog.
