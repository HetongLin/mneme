# Mneme Learning Model

Mneme turns a self-directed learner's approved source material into durable learning objects and review probes. This glossary defines the shared language used to reason about that learning model.

## Language

**Concept**:
A user-authored or user-approved vault-global knowledge model that can be explained, applied, and assessed independently. Knowledge that can carry a different importance or be learned and forgotten separately belongs in a separate Concept.
_Avoid_: Topic, summary, note

**Concept Title**:
The editable primary-language name of a Concept. It names the knowledge for the learner and does not identify durable state.
_Avoid_: Concept ID, filename, bilingual title string

**English Alias**:
An optional canonical English display and search alias stored separately from Concept Title. The feature is disabled by default, is useful mainly for non-English titles, and never participates in durable identity.
_Avoid_: Required translation, identity stem, duplicate English title

**Concept Display Title**:
The user-facing title composed from Concept Title and an optional English Alias. It is `Concept Title (English Alias)` when the alias exists and differs; otherwise it is the Concept Title alone.
_Avoid_: Concept ID, raw title field, filename

**Concept ID**:
The immutable, semantically opaque identity stored as a Concept's `mneme_id`. Mneme allocates new IDs independently as `concept-<random token>`; titles, aliases, and file paths may change without changing this identity.
_Avoid_: Concept path, folder name, title slug

**Source Provenance**:
The durable record of which Source Note supported a Concept, including the relation and approved evidence available at that time. If the Source later disappears, the provenance becomes stale rather than being erased.
_Avoid_: Source cache, live backlink, disposable index entry

**Stale Source**:
A Source referenced by approved provenance that Mneme can no longer resolve at its recorded path. It remains historical evidence and may be relinked or explicitly removed by the learner.
_Avoid_: Deleted provenance, invalid Concept

**View**:
An alternative explanation, example, application, or perspective that deepens the same Concept without becoming an independently assessable knowledge object.
_Avoid_: Separate Concept, duplicate Concept

**Possible Duplicate**:
A review signal that two Concepts may represent the same independently assessable knowledge object. It invites a learner decision and does not merge or modify either Concept.
_Avoid_: Confirmed duplicate, automatic merge

**Review Gate**:
The required user interaction in which a complete AI-proposed knowledge change is presented before it may be accepted and written. Direct learner authorship needs no artificial approval step; confidence scores and unseen batch selections cannot satisfy the gate.
_Avoid_: Accept All, auto-approval, confidence threshold

**Guided Merge**:
A dedicated user-directed workspace that reconciles two written Concepts through explicit pair/survivor selection, an editable Manual or AI-assisted content draft, and a zero-write impact preview before any files or states change. AI may advise or draft learning prose but cannot select or execute the merge.
_Avoid_: Inbox Accept, automatic merge, silent deduplication

**Redirect Note**:
A minimal non-Concept Markdown note left at a merged Concept's former path that points to the surviving Concept. It preserves existing vault links without remaining eligible for Concept browsing or review.
_Avoid_: Duplicate Concept, archived Concept, active Concept

**Concept Merge Record**:
A content-free identity record that maps a permanently retired Concept ID and former path to the surviving Concept ID and path. It prevents merged identities from being reused and is not a source of Concept content.
_Avoid_: Redirect Note content, Concept alias, duplicate Concept

**Card**:
A review probe that tests one independently rateable learning outcome belonging to a Concept. A Card may require several reasoning steps, but outcomes that can be answered correctly or forgotten separately belong on separate Cards.
_Avoid_: Concept, multi-outcome quiz, content summary

**Card Grounding**:
The approved Concept claim or section that a Card tests. A Card may transfer that knowledge into a new scenario, but it cannot introduce an unapproved claim through its answer or rubric.
_Avoid_: AI rationale, new knowledge, Source-only evidence

**Coverage Map**:
A concise account of which distinct learning outcomes existing and proposed Cards test for a Concept. It guides small, non-duplicative generation rounds without implying that every Concept needs every Card category.
_Avoid_: Card quota, mastery percentage, content outline

**Learning Content Fingerprint**:
A stable digest of the approved, assessable Concept content used to decide whether Card generation has new knowledge to cover. It excludes presentation, provenance, organization metadata, and review-navigation text.
_Avoid_: Whole-file hash, Concept version, Card batch ID

**Card ID**:
The immutable explicit identity of one Card block inside a Card Group. Mneme allocates new IDs independently as `card-<random token>`; Concept ownership, Card Type, content, paths, and AI output do not name Card identities.
_Avoid_: Card index, file path, generated fallback key

**Card Group**:
The single Markdown file belonging to one Concept that contains its Cards as separately identified blocks. File grouping is for readable storage and navigation; each Card retains an independent Card Memory State.
_Avoid_: One-file-per-Card layout, shared Card schedule

**Learning State**:
A reasoned view that keeps Card memory evidence and assessment coverage distinguishable. It describes what Mneme has observed without claiming mastery, and it never schedules the Concept directly.
_Avoid_: Concept mastery, mastery score, percent mastered

**Importance**:
The learner's judgment of how valuable a Concept is to remember or use. It may prioritize already-eligible Concepts, but it does not implicitly change Card scheduling parameters.
_Avoid_: Difficulty, retention target, urgency

**Card Memory State**:
The scheduler-owned memory and due-date state of one Card. Completed review ratings update this state; Concept aggregation and queue presentation must not override its scheduling decisions.
_Avoid_: Concept schedule, aggregate due date

**Retention Target**:
The explicit scheduler policy describing the desired probability of recalling reviewed Cards. It is independent of Concept Importance and may be overridden only through an intentional scheduling setting.
_Avoid_: Importance, mastery target, priority

**Anki Export**:
A one-way snapshot that copies approved Mneme Cards into an Anki-importable artifact. Exported Cards are independent copies: Mneme neither synchronizes their content nor reads or controls their Anki scheduling and review history.
_Avoid_: Anki sync, Anki Review Backend, shared Card state

**Knowledge Context Pack**:
A portable, review-safe export containing the Concepts the learner has approved. It is neutral about any later use and excludes Cards, scheduler state, credentials, and internal diagnostics.
_Avoid_: Project request, vault backup, agent memory dump, Card export

**Review Later**:
A temporary Card-level queue control that hides a Card until the next local day without changing its Card Memory State.
_Avoid_: Reschedule, postpone due date

**Suspend Card**:
An indefinite Card-level queue control that excludes a Card from review until the learner explicitly resumes it, without changing its Card Memory State.
_Avoid_: Delete Card, Pause Concept

**Retire Card**:
A permanent withdrawal of a Card from active review that preserves its learning content and history.
_Avoid_: Delete Card, Suspend Card

**Reset Progress**:
An explicit action that clears a Card's Card Memory State while preserving its learning content.
_Avoid_: Review Again, Delete Card

**Delete Card**:
An explicit destructive action that permanently removes a Card's learning content and active scheduling state after confirmation. Its anonymous historical events remain unless the learner separately requests complete erasure.
_Avoid_: Retire Card, Suspend Card

**Card Tombstone**:
The minimal record that an immutable Card ID was deleted, containing no learning content. It prevents identity reuse and lets historical review events remain statistically valid without rejoining Concept Learning State.
_Avoid_: Retired Card, deleted Card content, active review state

**Pause Concept**:
A Concept-level presentation control that hides the Concept from active review without changing any Card Memory State.
_Avoid_: Suspend all Cards, reschedule Concept
