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

## Index reconciliation (2026-09-07)

Index scans remain read-only and outside the mutation queue. They submit observed
records and proposed removals/stale transitions, not replacement maps. Each store
loads current state inside the queue and applies a change only if that individual
record still matches the observed snapshot. Changed or removed candidates are
skipped; unobserved additions remain intact. Reported removals and stale IDs come
from the changes actually committed.

Source pending-proposal cleanup reads membership from the current
`knowledgeProposals` in that same queue entry, rather than an earlier scan's ID
set. The unused whole-map replacement APIs for Source records and provenance
links are removed. No persisted format changes are needed.

This check protects against concurrent in-process state mutations. It does not
make the earlier filesystem observation atomic with the later state save; an
external filesystem change may require a subsequent reconciliation.

## Uncertain Markdown writes (2026-09-10)

The shared Markdown transaction records a write as attempted inside the atomic
transform, after its exact `before` check passes and before returning `after`.
`Vault.process()` may apply the result and then reject, so a resolved Promise is
not required for compensation. A rejected precondition never registers ownership
of that file, even if its current content equals the planned result.

On failure, compensation visits attempted writes in reverse order. Exact `after`
content is restored to `before`; content already equal to `before` is left as is.
Any other content is preserved and reported as a rollback conflict. Compensation
continues for other files, and state rollback still runs only if state commit was
attempted. Callers continue to receive the original error or an error including
all rollback failures.

This is same-process compensation only. It adds no journal and cannot recover
after process termination or guarantee consistency when compensation fails.

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
