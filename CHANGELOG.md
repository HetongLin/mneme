# Changelog

## 1.1.0 — 2026-10-04

- Add Anthropic (Claude), Google (Gemini), Alibaba Cloud (Qwen), Zhipu (GLM), Moonshot (Kimi), SiliconFlow, and custom OpenAI-compatible endpoints alongside OpenAI, DeepSeek, and offline Mock.
- Route Concept capture, Card generation, English aliases, and optional Merge assistance through the selected provider; keep existing approval and grounding checks.
- Save independent provider profiles with configurable model IDs, endpoints, output token limits, and compatible JSON mode. Custom endpoints support Chat Completions or Responses and optional authentication.
- Preserve legacy OpenAI/DeepSeek settings; snapshot request configuration so changing providers during a request does not reinterpret its response.
- Reject incomplete, refused, and malformed JSON responses; redact authentication secrets from transport errors.
- Add provider protocol, failure-path, fingerprint, and settings regression coverage, plus a [provider setup guide](docs/AI_PROVIDERS.md).

Provider protocol tests use mocked HTTP responses. Live model/account compatibility is not certified; select a model supporting the configured JSON protocol.

## 1.0.1 — 2026-10-04

- Embed Mneme, ts-fsrs, Zod, and inherited scaffold license notices directly in `main.js`, so BRAT and individual-file installations retain the required notices as well as ZIP installations.
- Make the release check reject bundles missing notices or third-party notices that do not match the installed dependencies.

This is a license-distribution patch. The executable plugin code, FSRS implementation, and styles are unchanged from the accepted 1.0.0 build.

## 1.0.0 — 2026-10-04

First public GitHub release of Mneme.

- Turn a source note into editable Concept proposals, then review and approve them in Inbox.
- Generate Card proposals from approved Concepts, or author Concepts and Cards directly.
- Keep Concepts and Card Groups in readable Markdown with stable identities and source provenance.
- Review Cards with local FSRS scheduling and Again / Hard / Good / Easy self-ratings.
- Browse Concepts, organize relationships, and explicitly review merge changes.
- Use offline Mock, OpenAI, or DeepSeek for bounded proposal generation.
- Export independent Anki TSV copies and Knowledge Context Packs.
- Include recovery handling for interrupted writes and review persistence.

The production plugin artifact was frozen and passed a clean-install core loop plus full Obsidian process restart on macOS / Obsidian 1.13.7. [Acceptance record](docs/FROZEN_RELEASE_SMOKE_2026-10-02.md). Windows and mobile have not received the same native acceptance coverage.

The public release adds documentation, examples, community templates, and CI around that accepted artifact.
