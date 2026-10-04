# Privacy and data boundaries

Mneme stores learning content in your Obsidian vault and makes AI requests only for explicit analysis or drafting actions. AI capture is disabled by default and the default provider is offline Mock.

## What stays local

Concept content and Card Front/Back are stored in Markdown files. Obsidian's Mneme plugin data stores settings, indexes, hashes, pending proposals, recovery information, Card scheduling state, and review history. Pending proposals and authoring or merge drafts may contain learning text.

Browsing, manual authoring, scheduling, normal review, and export use local logic. There is no Mneme account or Mneme-operated AI service. The plugin has no built-in analytics or telemetry sender. Obsidian, other installed plugins, sync services, and your AI provider have their own data practices.

## What a remote AI request includes

Requests go to the provider and base URL you select in settings.

| Action | Content and context sent |
| --- | --- |
| Analyze Current Note | The selected source note's content, split into extraction chunks when needed; its vault-relative path and content hash; chunk, language, and formatting context. The Concept library is not sent for first-pass extraction. |
| Generate Cards | Approved Concept learning content, Concept title and ID, path and hash, allowed Card types, and existing Card fronts used to avoid duplicate coverage. |
| Generate with AI (optional English alias) | The Concept title and Core Meaning used to draft an English alias. |
| Optional AI assistance in Merge | The selected candidates or compact shortlist and relevant learning content needed for the requested classification or draft. |

Your API key is sent to the configured endpoint for authentication. Keys are stored as plaintext values in Obsidian's local plugin data.json; Mneme does not encrypt them and does not include them in its logs. A custom base URL changes who receives these requests, including when you use a regional or self-hosted endpoint. Providers may charge for usage and apply their own retention policies. Accepting a proposal controls the final Markdown write; it does not undo content already sent for drafting.

## API keys and sharing

Keys are stored locally in Obsidian plugin data.json. Mneme does not encrypt them and does not intentionally log them. Obsidian Sync, vault backups, and other configuration sync may copy this file, depending on how those tools are configured; review their privacy settings before syncing a vault that contains API keys.

Keep keys, plugin `data.json`, private source notes, and unredacted logs out of public bug reports and shared demo vaults. If you accidentally share a key, revoke it with its provider.

## Exports

Anki TSV and Knowledge Context Pack exports are local files. You decide where to share or import them. Anki exports are independent copies and do not synchronize review history back to Mneme.

[Getting started](GETTING_STARTED.md) · [Report a vulnerability](../SECURITY.md)
