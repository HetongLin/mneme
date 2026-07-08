# Card deletion preserves anonymous review history

Delete Card removes the Card block from Markdown and clears its active FSRS state and queue controls, but keeps a content-free Card Tombstone and historical review events. Deleted Cards do not contribute to Concept Learning State, and their immutable Card IDs are never reused. A separate explicit `Delete History Too` action permanently removes the tombstone and review history when the student wants complete erasure; Retire Card remains the safer choice when content should be preserved.
