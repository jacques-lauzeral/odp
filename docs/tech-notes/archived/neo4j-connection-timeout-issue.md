# Neo4j Connection Pool Exhaustion — Issue Note

## Symptom

After a number of sequential import operations, the server becomes unresponsive. Neo4j queries time out with:

```
Connection acquisition timed out in 60000 ms.
Pool status: Active conn count = 10, Idle conn count = 0.
```

Subsequent requests hang until the pool clears or the server is restarted.

## Context

The `DistributedEditionImporter` is connection-intensive — a single file import triggers multiple sequential service calls:

| Phase | Operations |
|---|---|
| Phase 0a | Chapter `getAll()` + `getById()` |
| Phase 1 | `listItems()` for stakeholders, refDocs, waves + `getAll()` for all requirements |
| Phase 2 | One `create()` per requirement |
| Phase 3 | One `getById()` + one `update()` per requirement |
| Phase 4 | Chapter `getById()` + `patch()` |

For a 135-requirement file this amounts to 300+ Neo4j operations in a single request. If any connection is not properly released back to the pool — due to a missing `session.close()`, an unhandled error path that bypasses cleanup, or a transaction left open — the pool drains after a few sequential imports.

## Likely Root Cause

A code path in the store or service layer that acquires a Neo4j session or transaction but does not release it on error. The greedy error handling in the importer (try/catch per entity) means failures do not propagate as thrown exceptions — but if the underlying store transaction is not explicitly closed on catch, the connection leaks silently.

## Investigation Starting Points

- **Store layer transaction/session lifecycle** — confirm every acquired session has a `finally { session.close() }` or equivalent, including on error paths
- **`VersionedItemStore`** — `create()` and `update()` error paths
- **`BaseStore`** — any helper that opens a session without a guaranteed close
- **Greedy import loop** — Phase 2 and Phase 3 each run 100+ sequential transactions; a leak on any one of them compounds across the loop

## Impact

- Application fully blocked until pool recovers
- All concurrent users affected — not scoped to the import request
- Requires server restart in worst case
- Manifests progressively: first imports succeed, pool drains after several files