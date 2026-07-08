# Mneme Learning Model

Mneme turns a student's approved source material into durable learning objects and review probes. This glossary defines the shared language used to reason about that learning model.

## Language

**Concept**:
A vault-global knowledge model or principle that can be explained and applied independently, with its understanding assessed independently. Knowledge that can carry a different importance or be learned and forgotten separately belongs in a separate Concept; a Course may reference but does not own or duplicate it.
_Avoid_: Topic, summary, note

**Concept ID**:
The immutable identity stored as a Concept's `mneme_id`. Titles and file paths may change without changing this identity.
_Avoid_: Concept path, folder name, title slug

**Concept Set**:
A purpose-selected collection of approved Concepts considered together for an exam, project, or other learning context. It references Concepts without copying or owning them.
_Avoid_: Course, duplicated Concept folder, permanent taxonomy

**Course**:
A learning context that relates Source Notes and vault-global Concepts for a curriculum. A Concept may participate in multiple Courses, and a Course does not create a separate copy of it.
_Avoid_: Concept owner, Concept folder, duplicated knowledge base

**Source Provenance**:
The durable record of which Source Note supported a Concept, including the relation and approved evidence available at that time. If the Source later disappears, the provenance becomes stale rather than being erased.
_Avoid_: Source cache, live backlink, disposable index entry

**Stale Source**:
A Source referenced by approved provenance that Mneme can no longer resolve at its recorded path. It remains historical evidence and may be relinked or explicitly removed by the student.
_Avoid_: Deleted provenance, invalid Concept

**Course Priority**:
The significance of a Concept within one Course. It belongs to the Course-Concept relationship and does not replace the Concept's vault-global Importance.
_Avoid_: Global importance, exam urgency

**Exam Focus**:
A temporary, exam-specific emphasis placed on Concepts within an exam scope. It expires with that exam context and does not rewrite global Importance or Course Priority.
_Avoid_: Global importance, permanent priority

**Exam Attempt**:
A record of a student's exam-scoped recall or explanation attempt. It contributes evidence and may produce Needs Work Signals, but it does not update Card Memory State or FSRS review history.
_Avoid_: Card Review, FSRS rating

**View**:
An alternative explanation, example, application, or perspective that deepens the same Concept without becoming an independently assessable knowledge object.
_Avoid_: Separate Concept, duplicate Concept

**Possible Duplicate**:
A review signal that two Concepts may represent the same independently assessable knowledge object. It invites a student decision and does not merge or modify either Concept.
_Avoid_: Confirmed duplicate, automatic merge

**Review Gate**:
The required user interaction in which the complete knowledge-changing proposal is presented before it may be accepted and written. Confidence scores and unseen batch selections cannot satisfy this gate.
_Avoid_: Accept All, auto-approval, confidence threshold

**Guided Merge**:
A user-directed process that reconciles two written Concepts through explicit content choices and a final Markdown preview before any files or states change.
_Avoid_: Inbox Accept, automatic merge, silent deduplication

**Redirect Note**:
A minimal non-Concept Markdown note left at a merged Concept's former path that points to the surviving Concept. It preserves existing vault links without remaining eligible for Concept browsing or review.
_Avoid_: Duplicate Concept, archived Concept, active Concept

**Card**:
A review probe that tests one independently rateable learning outcome belonging to a Concept. A Card may require several reasoning steps, but outcomes that can be answered correctly or forgotten separately belong on separate Cards.
_Avoid_: Concept, multi-outcome quiz, content summary

**Card Grounding**:
The approved Concept claim or section that a Card tests. A Card may transfer that knowledge into a new scenario, but it cannot introduce an unapproved claim through its answer or rubric.
_Avoid_: AI rationale, new knowledge, Source-only evidence

**Coverage Map**:
A concise account of which distinct learning outcomes existing and proposed Cards test for a Concept. It guides small, non-duplicative generation rounds without implying that every Concept needs every Card category.
_Avoid_: Card quota, mastery percentage, content outline

**Rating Suggestion**:
An AI assessment of a student's answer against a Card Rubric that explains strengths, omissions, and a proposed review rating. It does not update Card Memory State until the student confirms a final rating.
_Avoid_: Automatic rating, FSRS decision, answer truth

**Card ID**:
The immutable explicit identity of one Card block inside a Card Group. It remains stable when content, file paths, or Concept placement change.
_Avoid_: Card index, file path, generated fallback key

**Card Group**:
The single Markdown file belonging to one Concept that contains its Cards as separately identified blocks. File grouping is for readable storage and navigation; each Card retains an independent Card Memory State.
_Avoid_: One-file-per-Card layout, shared Card schedule

**Learning State**:
A reasoned aggregate view of the available evidence about a Concept, including Card Memory States, assessment coverage, and explicit student input. It describes what Mneme has observed without claiming that the student has mastered the Concept, and it never schedules the Concept directly.
_Avoid_: Concept mastery, mastery score, percent mastered

**Importance**:
The student's judgment of how valuable a Concept is to remember or use. It may prioritize already-eligible Concepts, but it does not implicitly change Card scheduling parameters.
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

**Use Project**:
A practical project selected to activate and combine a Concept Set in a concrete target context. Its value comes from making the role, limits, and interaction of learned Concepts observable through practice.
_Avoid_: Generic project idea, single-Concept quiz, AI chat

**Knowledge Context Pack**:
A portable, review-safe export that tells an external agent which Concepts the student has approved and learned from. It is neutral about the agent's next task and excludes Cards, scheduler state, credentials, and internal diagnostics.
_Avoid_: Project request, vault backup, agent memory dump, Card export

**Needs Work Signal**:
A reason-coded indication that some aspect of a Concept needs attention, originating either from student input or derived learning evidence. Multiple signals may coexist, remain attributable to their source, and do not directly change a Card's due date.
_Avoid_: Weak Concept flag, mastery failure

**Review Later**:
A temporary Card-level queue control that hides a Card until the next local day without changing its Card Memory State.
_Avoid_: Reschedule, postpone due date

**Suspend Card**:
An indefinite Card-level queue control that excludes a Card from review until the student explicitly resumes it, without changing its Card Memory State.
_Avoid_: Delete Card, Pause Concept

**Retire Card**:
A permanent withdrawal of a Card from active review that preserves its learning content and history.
_Avoid_: Delete Card, Suspend Card

**Reset Progress**:
An explicit action that clears a Card's Card Memory State while preserving its learning content.
_Avoid_: Review Again, Delete Card

**Delete Card**:
An explicit destructive action that permanently removes a Card's learning content and active scheduling state after confirmation. Its anonymous historical events remain unless the student separately requests complete erasure.
_Avoid_: Retire Card, Suspend Card

**Card Tombstone**:
The minimal record that an immutable Card ID was deleted, containing no learning content. It prevents identity reuse and lets historical review events remain statistically valid without rejoining Concept Learning State.
_Avoid_: Retired Card, deleted Card content, active review state

**Pause Concept**:
A Concept-level presentation control that hides the Concept from active review without changing any Card Memory State.
_Avoid_: Suspend all Cards, reschedule Concept
