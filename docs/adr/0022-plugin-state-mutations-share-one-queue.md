# ADR 0022: Plugin State Mutations Share One Queue

## Status

Accepted

## Context

Mneme stores several independent domains in one `data.json` object. Review,
settings, proposals, drafts, provenance, and Merge previously loaded a complete
snapshot and saved its replacement independently. Concurrent operations could
read the same snapshot and erase each other's updates. Serializing only
`saveData()` would still save stale snapshots.

## Decision

Every plugin-data mutation uses `runPluginDataMutation()` to serialize the
complete read, validation, modification, and save operation. The queue belongs
to the shared storage object: production stores and services receive the same
Mneme plugin instance. Future wrappers must preserve that common owner.

Proposal status transitions read and validate the current proposal inside the
queue. Settings persistence and the Review store's settings update also happen
inside the same operation. Public read-only APIs remain unlocked.

For operations that also change Markdown, the final state-snapshot check,
Markdown writes, state commit, and compensating rollback share one queue entry.
Preparing a preview remains read-only and outside the queue; confirmation
checks that its snapshot is still current. A callback holding the queue must
compose changes directly, without calling another queued mutation and waiting
for it. It must not wait for user input or provider calls.

The caller receives any failure. A failed mutation does not prevent later
queued work from running. Different storage owners have independent queues.

## Consequences and Boundaries

- Independent in-process state mutations preserve one another's changes.
- Existing `data.json` schema, stable IDs, and Markdown formats do not change.
- A long local Markdown operation can delay unrelated state saves; keeping the
  lock through compensation prevents rollback from erasing a later mutation.
- A caller-provided whole record or replacement map still replaces that record
  or map. Multi-step workflows that build such inputs outside the queue need
  their own conflict or completion policy.
- The queue does not coordinate other processes, Sync, plugin instances, or
  storage wrappers with different object identities.
- This is not a durable journal or a filesystem transaction. It does not make
  every authoring workflow idempotent after restart, guarantee recovery when
  both commit and rollback fail, or replace atomic Markdown snapshot checks.

Regression tests cover concurrent Review stores, Review with other state
domains, proposal lifecycle transitions, Merge with Review during commit and
rollback, failure recovery, and independent storage owners.
