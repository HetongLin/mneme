# One Card Group per Concept

Mneme writes one Card Group Markdown file per Concept, with every Card stored as a separately identified block and scheduled independently. This keeps the vault Concept-centered and avoids one-file-per-Card growth; legacy one-card files remain readable and may be consolidated through an explicit migration, but new accepted Card proposals append to the Concept's Card Group.

## Consequences

The Concept points to a Card Group file rather than a folder. Card edit, deletion, merge, identity repair, and FSRS state continue to operate on immutable Card IDs, while Markdown writes must append or modify an individual block without replacing unrelated Cards.
