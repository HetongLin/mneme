# Mneme Next-Session Hand-off

Updated: 2026-09-09

## 2026-09-05 至 09-09 代码审查后续

- 第十二轮从已提交检查点 `34e8d72` 继续，代码/ADR 提交为 `9a33133`，分支为 `fix/repair-provenance-reconciliation`。修复 P1：缺失 Concept ID 修复后，Resync 会把保留旧 ID 的 Source link 当作孤立索引删除，丢失 evidence；旧版本对照已复现整个链接表被删空。
- 来源清理现在区分“Concept 未找到”和“Source 缺失”。仅前者在共享队列内检查最新 `conceptIdRepairs`；凡 pending/completed 记录涉及的 old Concept/old review/new ID，均完整保留链接并返回 deferred IDs。Inbox 和 Resync 显示归属待核对，不再误报索引全部匹配。不存在修复记录的普通清理、明确移除及已找到 Concept 的缺失 Source 清理维持原行为。数据格式不变，策略见 [ADR 0029 补充](adr/0029-concept-id-repair-resumes-both-markdown-files.md)。
- 第十二轮验证：全量测试、构建、发布检查和 diff 检查全部通过。新增真实 repair→resync 与扫描后/清理前完成修复的集成回归；覆盖 pending/completed × missing/duplicate、旧/新 ID、重复同步、明确移除和坏记录。临时日志 `/private/tmp/mneme-repair-provenance-all.log`，旧版失败日志 `/private/tmp/mneme-repair-provenance-red.log`。
- **后续边界**：本轮保留来源证据，不自动重归属或全局替换历史引用。完成记录会持续保护关联 ID，即使其文件后来被外部删除；明确的归属协调入口，以及历史创建记录/Proposal/Merge draft 对修复 ID 的处理，仍可继续审查。真实 Obsidian 待验收：修复一个带旧来源关联的缺失 ID，再运行 Resync 并刷新 Inbox，确认 evidence 保留且出现待核对提示；重启/平台验收仍待执行。

- 第十一轮从已提交检查点 `764354a` 继续，代码/ADR 提交为 `32f6f3d`，分支为 `fix/concept-id-repair-recovery`。Concept ID 修复改为共享队列内持久化 intent → 分别核对/原子更新 Concept 和 Card Group → 一次保存暂停状态迁移和完成标记；失败不再无条件回写旧正文。新增 **Resume Concept ID Repair**，启动只提示。详见 [ADR 0029](adr/0029-concept-id-repair-resumes-both-markdown-files.md)。
- 新增可选 schema-version-1 `conceptIdRepairs`，记录两个文件的路径/前后哈希及 ID/迁移策略/时间/状态，无正文。已写完的文件恢复时不重写；已完成请求也须核验当前文件。重复 ID 保留共享旧暂停；缺失 ID 只迁移独占 orphan owner 的暂停。沿用 group 当前 ID 时只补 Concept，并保留已有暂停。
- 交叉保护覆盖 Card ID 修复、删除、Manual/Inbox 创建、Merge、暂停操作及 Review View 的旧暂停清理。另一 Card Group 占用目标 ID 或 orphan owner 时阻止修复；完成记录保留新 ID 预留和旧迁移来源保护。
- 第十一轮验证：全量测试、构建、发布检查及 diff 检查通过。覆盖两个文件各自写入前后失败、两次保存前后失败、重建存储恢复、暂停迁移/保留、互斥操作、来源/草稿保留、刷新失败及旧暂停清理；临时日志 `/private/tmp/mneme-concept-id-repair-all.log`。
- **下一轮建议**：审查修复后的 Source/索引/历史创建记录引用是否需要显式协调；本轮按原约定保留这些数据，不做全局旧 ID 替换。真实 Obsidian YAML/UI、双文件中断/重启、跨平台验收仍待执行；外部文件编辑导致冲突时不自动恢复旧正文。

- 第十轮从已提交检查点 `596f4e9` 继续，代码/ADR 提交为 `ab38414`，分支为 `fix/card-id-repair-recovery`。单张 Card ID 修复已改为共享队列内的持久化 intent → `Vault.process` 全文件核对 → 状态迁移/完成标记一次保存；刷新失败不再回写旧 Markdown。新增 **Resume Card ID Repair**，启动只提示。详见 [ADR 0028](adr/0028-card-id-repair-resumes-without-markdown-rollback.md)。
- 新增可选 schema-version-1 `cardIdRepairs`，只存 ID、路径、block index、哈希、迁移策略、时间和状态，无正文。完成记录保留，用于新 ID 预留、防止重复执行，以及阻止旧窗口重建已迁移 fallback 状态；重复 ID 修复仍保留共享旧状态。历史重置不会清除此记录；外部编辑后复用旧 path/index 需人工检查。
- 第十轮验证：全量测试、构建、发布元数据检查、最终 Card 专项测试和 diff 检查通过。覆盖写入前后故障、重建存储恢复、state/events/controls 迁移、真实队列交错、刷新失败及 Manual/Inbox ID 预留；临时日志 `/private/tmp/mneme-card-id-repair-all.log`、`/private/tmp/mneme-card-id-repair-focused.log`。
- 第十轮遗留问题（第十一轮已处理）：Concept ID 修复当时仍是整文件写入和无条件失败回滚，需独立的双文件持久化协议，尤其要检查它与 pending Card ID 修复的交错。不要把本轮单 Card 协调器的保证推广到 Concept 修复或外部 Vault 写入。真实 Obsidian YAML/UI/重启与跨平台验收尚未运行。

- 第九轮从已提交检查点 `2b437f3` 继续，代码/ADR 提交为 `cb1957b`，分支为 `fix/identity-repair-content-safety`。修复 Card ID 替换丢失 type/自定义属性，以及空 YAML ID 吞掉下一字段、丢失引号/注释的问题；仅替换 ID 值并保留换行。歧义属性和不支持的 scalar 语法会阻止修复。
- Concept ID 修复在任何文件写入前读取当前 Markdown，检查 ID、链接和 Card Group 归属。外部归属、共享链接（含旧 folder 引用）、新 ID 冲突、陈旧链接及缺失/错误类型目标均阻止写入；仍允许缺失 ID 的 Concept 接回无人认领的 group owner。没有改变数据格式。
- 第九轮验证：全量测试、构建、`check:release -- 1.0.0` 和 diff 检查全部通过；临时日志 `/private/tmp/mneme-identity-content-safety-all.log`。新 Modal 回归使用真实 save 方法和 YAML fixture 替身；旧实现面对其他 Concept 的 Card Group 仍写入两个文件，新实现阻止全部写入。真实 Obsidian YAML、UI 和重启验收尚未执行。
- 第九轮遗留问题（第十轮已处理单 Card，Concept 仍待处理）：Card/Concept ID 修复当时仍使用整文件 `vault.modify`，状态迁移或刷新失败时无条件写回旧内容。当前归属预检不解决并发写入、ID 原子预留、保存生效后报错和中断恢复。需要独立的持久化 ID 修复协调器与故障矩阵；保留 duplicate-ID 不迁移共享旧状态、missing-ID 只迁移明确归属状态的现有语义。详见 [审查报告](CODE_REVIEW_2026-09-05.md) 和 [ADR 0020](adr/0020-random-opaque-entity-identities-and-optional-english-aliases.md)。

- 第八轮从检查点 `347caa7` 继续，代码/ADR 提交为 `fc87e06`，分支为 `fix/card-deletion-recovery`：修复单张 Card 删除的整文件并发覆盖、状态保存后报错回滚，以及刷新失败恢复已删除 Card 的问题。删除改为持久化 intent → `Vault.process` 核对移除 → 单次保存 tombstone/清理控制/移除 intent。新增 **Resume Card Deletion**；启动只提示。详见 [ADR 0027](adr/0027-card-deletion-persists-intent-before-markdown.md)。
- 第八轮验证：全量测试、构建、`check:release -- 1.0.0` 和 diff 检查全部通过；日志 `/private/tmp/mneme-card-deletion-recovery-all.log`。新增持久化故障矩阵、并发删除、评分交错、旧控制状态、Modal 双击/刷新失败及写入冲突测试。
- 第八轮新增可选 schema-version-1 `cardDeletion`，仅含 ID、路径、前后哈希和时间。完成后移除记录；保留提案、草稿、历史事件及其他 Card。删除中和删除后的旧评分/暂停/归档/延后动作会被阻止；同一路径的创建与合并须先完成删除恢复。
- 第八轮没有修改 ID 修复流程；第九轮已补充内容与归属检查，状态迁移及失败回滚仍待审查。真实 Obsidian 中断/重启及跨平台验收仍未完成。

- 第七轮从安全检查点 `d9b7874` 继续，代码/ADR 提交为 `daa70e1`：删除已改为持久化记录 → 非 Markdown 临时路径核对 → 本地 Vault 回收站 → 单次状态完成。新增 **Resume Concept Deletion** 命令，可在原 Concept 文件已消失时恢复；启动只提示，不自动执行。详见 [ADR 0026](adr/0026-concept-deletion-resumes-from-durable-staging.md)。
- 第七轮验证：`npm run test:all`、`npm run build`、`npm run check:release -- 1.0.0`、`git diff --check` 全部通过。全量日志：`/private/tmp/mneme-concept-deletion-recovery-all.log`。尚未运行真实 Obsidian 中断/重启和跨平台回收站验收。
- 第七轮数据变化：schema version 1 的可选 `conceptDeletions` 字段，仅存路径、ID、哈希和阶段，不复制 Markdown；完成记录移除 Card IDs。完成时同时保存 tombstone、清理来源链接和 Source 索引。现存 Proposal、草稿和匿名复习历史保留。
- 继续时重点关注真实 Obsidian 的中断/重启/本地回收站验收，以及删除后残留提案的显式整理策略。外部改动冲突、旧的无记录部分删除不会自动修复；不要直接删除 journal 或把手动恢复文件当作撤销 tombstone。

- 已先构建并提交审查前备份：`83deb3f`，其父提交 `9cd98ad` 是原产品代码。
- 当前审查/重构分支：`fix/repair-provenance-reconciliation`；第一轮代码提交为 `04bc46f`、`4e16141`、`95cf030`，文档检查点为 `0377c60`；第二轮代码提交为 `37d3533`，文档检查点为 `30bcce7`；第三轮代码提交为 `3100b9b`、`5617b23`，文档检查点为 `4e57766`；第四轮代码/ADR 提交为 `f2dbec4`，文档检查点为 `59ddfd2`；第五轮从该已提交检查点继续，代码/ADR 提交为 `ecd462c`，文档检查点为 `d125577`；第六轮代码提交为 `f66bd16`（索引同步）和 `3a9f321`（删除校验），之后另有本交接/审查文档提交。
- 第一轮修复合并/Related 的并发覆盖、Card 并发追加丢失、Review 重复动作跳卡，并提取共用 Markdown 事务与 Review 动作保护。
- 第二轮让所有当前 `data.json` 写入共用完整读/检查/改/存队列，覆盖 Review、Settings、Proposal、草稿、来源索引及 Merge 回滚；来源重连/移除也已接入原子 Markdown 事务；诊断开关现在只重绘，不重置复习进度。数据格式与版本不变。队列的共享 storage owner 和禁止嵌套获取规则见 [ADR 0022](adr/0022-plugin-state-mutations-share-one-queue.md)。
- 第二轮 `npm run test:all`、`npm run build`、`npm run check:release -- 1.0.0`、`git diff --check` 均已通过。新增确定性交错测试覆盖共享状态、真实 `saveSettings()` 方法、Merge 回滚、来源写入/回滚冲突。详细证据见 [CODE_REVIEW_2026-09-05.md](CODE_REVIEW_2026-09-05.md)。
- 第三轮已修复新发生的 Inbox 中断写入：写前保存仅含路径/固定 ID/哈希的 `writeReceipt`，五类可写提案统一完成来源索引和 written 状态；重建后重试识别已有 Markdown，不分配第二份路径/ID。恢复记录、未完成 approved 提案保留在 Inbox/索引中，旧窗口不能覆盖。完成后去掉 payload，仅保留完成元数据。详见 [ADR 0023](adr/0023-approved-writes-have-durable-recovery-records.md)。这是 schema version 1 上的可选新增字段，Markdown 格式不变。
- 第三轮也修复 Composer 创建期间输入/异步重绘/关闭交错，并区分创建成功、草稿清理失败、View 刷新失败。最新全量测试、构建、发布检查和 diff 检查已通过；恢复测试包含写入前后故障、重建存储/Writer、并发复习、冲突及索引清理。
- 第四轮已修复 P2 Manual Card 创建成功但草稿清理失败后的持久化恢复：`manualCardWriteService` 在 Markdown 前保存固定 ID/路径/哈希，完成状态、删除草稿正文、轮换 `manualCardDraftId` 在一次状态保存中完成。重试核验已有 Card，不重复追加；旧窗口不能恢复已完成草稿。作者刻意新建同正文 Card 仍允许，且不经过 Inbox。旧草稿在 `getState()` 中获得持久化身份；服务要求调用者先加载并保存该身份，不自行认领无身份草稿。见 [ADR 0024](adr/0024-manual-card-creation-resumes-a-durable-draft.md)。
- 第四轮同时修复 Composer 恢复后的控件锁定、加载失败/关闭交错、`prepare()` 丢失尚未自动保存的输入，以及缺失 Concept 被静默替换的问题；Inbox 和手动写入也会避开彼此预留的 Card ID。成功后 View 使用服务返回的新草稿，不再额外执行独立清理保存。
- 2026-09-07 最终 `npm run test:all`、`npm run build`、`npm run check:release -- 1.0.0`、`git diff --check` 全部通过。手动恢复测试对新建/追加各注入六类写入前后故障，每次重建存储和 Vault，断言完整 Card ID 列表及不重放已完成的 Markdown；还覆盖旧草稿迁移、无关追加、冲突、陈旧保存、同正文新草稿和并发 Review。Composer 使用真实方法与渲染替身测试，未做真实 Obsidian 重启/平台验收。
- 第五轮已完成直接创建 Concept 的失败恢复审查：原流程在来源状态保存失败时无条件删除新建 Markdown，可能删掉保存等待期间的用户编辑。现在通过 `manualConceptWriteService` 先保存固定 ID/路径/哈希/别名设置/Source 快照，再创建或核验 Markdown，最后一次保存完成来源索引、written 状态与草稿身份轮换；新草稿清除已完成正文，但保留 Source 选择。失败后保留 Markdown，通过 Resume Creation 显式恢复。见 [ADR 0025](adr/0025-manual-concept-creation-resumes-a-durable-draft.md)。这是 schema version 1 的可选新增元数据，Markdown 格式不变。
- 第五轮也保护了 pending/陈旧草稿的保存和清理、手动重名 Merge 的草稿身份，以及 Inbox/手动 Concept 的路径和 ID 预留。Concept Composer 统一普通创建与恢复完成流程，锁定输入、取消过时别名结果，关闭时等待创建；延迟重名检查/标签刷新/旧 Merge 回调不能再改写已关闭或更新后的表单。成功后采用服务返回的新草稿，无额外清理保存。
- 第五轮自动验证通过：`npm run test:all`、`npm run build`、`npm run check:release -- 1.0.0`、`git diff --check`。恢复矩阵包含 Source 有/无 × 六类落盘前后故障，每次重建存储/Vault 并使用原始 draftId 重试，核验一个固定 ID/路径、已有 Markdown 不重放、草稿轮换与来源记录保留；另有真实 View 方法的生命周期/控件测试、显式屏障下的 Review 并发测试。完整日志在 `/private/tmp/mneme-manual-concept-recovery-all.log`。这些测试未替代真实 Obsidian 重启/平台验收。
- 第六轮修复索引同步的整表旧快照覆盖：Source records 和 Concept Source links 改为逐条条件更新，在共享队列中核对当前记录；并发新增、更新、重连或明确移除的内容会保留。pending proposal IDs 按提交时的实际提案表清理，结果只报告真正应用的删除/stale 变更。无其他调用者的整表替换接口已移除，数据格式不变。规则补充在 [ADR 0022](adr/0022-plugin-state-mutations-share-one-queue.md)。
- 第六轮也修复 Concept 删除中的 Related Markdown 并发覆盖/回滚覆盖，并要求 Cards 文件有可识别类型与匹配的 Concept owner；缺失身份的普通笔记不会进入删除计划。删除前再次检查目标快照，恢复路径被占用时保留现有内容并报告回滚失败。这些修复不等于完整的持久化删除事务。
- 第六轮 `npm run test:all`、`npm run build`、`npm run check:release -- 1.0.0`、`git diff --check` 已通过；全量日志在 `/private/tmp/mneme-index-deletion-safety-all.log`。新增索引测试使用真实 stores 在文件检查期间交错写入。旧删除实现的临时构建在并发编辑用例中返回 deleted 而非 conflict，修复后测试通过；还覆盖所有者校验、正常/冲突回滚、并发重复执行、删除前新增内容和恢复路径占用。Concept Library/Vault-state runner 已显式等待导出的测试 Promise。
- 第六轮遗留的持久化删除风险已在第七轮修复，见顶部说明；历史上无记录的部分删除仍需人工核查。针对已删除 Concept 的活动提案/合并草稿，当前保留正文并阻止继续写入该 Concept，后续可审查显式整理入口。
- 上述已完成修复不代表全库审查或真实 Obsidian 验收结束。历史上已发生且没有 receipt 的部分写入不能自动认领；目标被改动/移动、恢复元数据损坏等情况仍需人工协调。恢复协议不覆盖外部进程写入、所有锁外整条记录替换、显式开发者数据清除或降级到忽略新字段的旧版本。报告里的真实 Vault/平台验收仍待完成。
- 以下录像/验收摘要描述审查前的 `9cd98ad`，旧 ZIP 与录像未被替换，也不代表本轮修改已完成真实 Vault 或跨平台验收。

## 审查前验收交接摘要

- 当前版本为 `1.0.0`，最新本地代码提交为 `9cd98ad`。本轮只更新交接文档，没有改代码，也没有重新运行测试。
- 最近完成的任务是独立测试 Vault 内的自行验收与录像交付：2026-08-30 录制核心流程，2026-09-04 补录重名冲突返回/取消。
- 两段 720p 录像已交给用户判断 UI；本次录制使用 Mock provider，不构成真实模型中英文提取质量的验收。
- 下一步优先接收用户的录像/手动测试反馈；若继续验收，补真实 provider 的中文、混合语言、长文本质量及尚未完整覆盖的发布门槛。
- 不要把此次专项通过解读为所有场景、所有平台均通过。测试 Vault 内还保留 1 个 Inbox Proposal 和 1 个合并草稿，供继续验收。

## Start Here

Repository:

```text
/Users/linus/Projects/mneme-workspace/app/mneme
```

The user communicates primarily in Chinese. Fixed product UI labels remain English.

Before changing code, read:

1. `AGENTS.md`
2. `docs/CODEX_BRIEF.md`
3. `CONTEXT.md`
4. Relevant ADRs under `docs/adr/`
5. `docs/PRODUCT_SPEC.md`
6. `docs/ROADMAP.md`
7. `docs/V1_RELEASE_CHECKLIST.md`

ADRs are authoritative when documents conflict.

## Critical Workspace Warning

The branch at the acceptance handoff was (the review continuation above names the current branch):

```text
codex/task-054-stale-source-remove
```

The branch name does not describe the current product scope. Relevant local commits are:

```text
9cd98ad feat: finalize lifelong learning capture and merge flows
9af59c5 docs: define lifelong learning release direction
8f65f89 feat: complete Mneme v1.0 learning workflow
```

At the start of this handoff update, tracked files were clean. The only untracked entries were the long-standing `mneme` self-link and `release-artifacts/`. This handoff update is a subsequent documentation-only working-tree change.

Do not:

- reset, checkout, clean, discard, or broadly overwrite the working tree;
- delete the long-standing untracked `mneme` self-link;
- delete `release-artifacts/` without inspecting it;
- refactor unrelated areas while beginning the next version.

Inspect `git status` and the actual files first. Preserve all existing user changes. Follow the repository's autonomous local Git policy in `AGENTS.md`; do not infer permission to push, tag a release, or publish from a request for a handoff.

## Current Verified State

Mneme metadata is at `1.0.0`. The v1.0 feature set is functionally complete, although the final cross-platform publication checklist is not complete.

The preceding implementation/release-preparation work reported these checks passing for the current release candidate. They were not rerun for this documentation-only handoff:

```text
npm run test:all  # passed
npm run build     # passed
npm run check:release -- 1.0.0  # passed
```

The current implementation includes:

- Source Note analysis with chunked, grounded AI Concept extraction;
- editable Inbox Review Gate for all AI knowledge changes;
- direct manual Concept creation without a fake approval step;
- direct manual Card creation for an approved Concept;
- clean Concept Markdown and one canonical Card Group Markdown file per Concept;
- independent immutable Card IDs and Card-level FSRS state;
- fixed Concept-generation prompt and selectable built-in AI Card types;
- Concept Library, Concept View, editing, deletion, search, tags, and Related Concepts;
- exact-name conflict handling through Merge, Refine Name, Keep Both, or Cancel, with zero-write draft Merge and source-state preservation on Back/close;
- Possible Duplicate detection and two-Concept Guided Merge;
- Anki-style review layout with fixed action bar and Card-level controls;
- optional Scheduled Review and Concept-grouped Today’s Focus;
- one-way Anki TSV export and neutral Knowledge Context Pack export;
- Concept deletion with explicit confirmation and preservation of anonymous historical review records.

## Non-negotiable Product Contracts

### Knowledge approval

- AI proposes; the learner reviews, edits, accepts, or rejects.
- AI must not write final Concept or Card Markdown directly.
- Direct learner authorship writes immediately and does not pass through Inbox.

### Content and state ownership

- Concept is the primary learning object.
- Card is an assessment instrument for one Concept.
- Concept Markdown is the source of truth for Concept content.
- One Card Group Markdown file per Concept is the source of truth for Card content.
- `data.json` stores indexes, proposals, fingerprints, FSRS state, events, logs, and caches—not Card front/back content.

### Identity

- Durable state is keyed by immutable Concept and Card IDs, never file paths.
- Concept Title is primary-language and editable.
- English Alias is optional display/search metadata. `Suggest English aliases` defaults off; English titles never show a redundant alias field.
- New Concept IDs are opaque random IDs such as `concept-k7m3p9qx` and remain immutable. Existing readable IDs remain valid.
- New Card IDs are opaque random IDs such as `card-gjsl5r2n` and remain immutable. They are independent of Concept ID, Card Type, and content.
- AI never chooses final IDs.

### Review and FSRS

- FSRS fully owns Card scheduling.
- Concept is only an aggregate learning state.
- Only an explicit normal Card review and user-confirmed Again/Hard/Good/Easy rating updates FSRS.
- Concept ranking, AI suggestions, browsing, organization, and export must not mutate FSRS.
- Normal review must not call AI.
- Manual `Review Cards` from Concept Library does update FSRS because it is a real Card review.
- No daily Concept/Card caps may hide FSRS-eligible Cards.
- Concept-level `Pause Concept` is not part of the active product UI; controls operate on Cards.

### Merge and links

- AI extraction is context-free and does not receive the existing Concept library merely to prevent duplicates.
- Duplicate Concepts may enter Inbox; reconciliation is an explicit later action.
- Guided Merge is user-triggered, previewed, transactional, and rollback-safe.
- Exact-name conflict Merge never pre-creates the incoming Concept: Inbox keeps the Proposal, Manual creation keeps its Composer draft, and only Confirm Merge writes.
- AI may help draft only learning prose; deterministic code handles metadata, Cards, IDs, Related links, Redirect Notes, state migration, and conflicts.
- Merged Cards retain their immutable IDs and FSRS histories.
- The MVP has one symmetric Related relationship. Adding/removing it updates both Concept files.

### Language and tags

- Fixed UI and structural labels are English.
- Generated learning prose follows the Source Note’s dominant language.
- Non-English Concept titles may carry a canonical English Alias when the optional setting is enabled.
- Tags are English lowercase slugs.
- AI should prefer a few broad stable tags and avoid generic or near-duplicate tag explosion.

## Latest Acceptance Evidence and Deliverables

All paths below are relative to the repository unless stated otherwise. Keep the artifacts and disposable Vaults; do not clean them as ordinary build output.

### Release candidate

- ZIP: `release-artifacts/mneme-1.0.0-9cd98ad.zip`
- SHA-256, rechecked on 2026-09-05: `c781f417262f66c74ae7b7e7932ae5524a59d4b104acea9d6dbb56e0035f454a`
- Older ZIPs coexist in this directory. Use the `9cd98ad` artifact for this handoff.

### Videos delivered to the user

| Recording | File | Approximate size |
| --- | --- | --- |
| Core workflow, recorded 2026-08-30 | `release-artifacts/mneme-1.0-recorded-acceptance-720p.m4v` | 588 MB |
| Conflict Back/Cancel, recorded 2026-09-04 | `release-artifacts/mneme-1.0-conflict-rollback-720p.m4v` | 104 MB |

Both are silent screen recordings. Their original `.mov` files remain alongside them (approximately 1.2 GB and 246 MB). Both conversions completed successfully and the output containers were identified as M4V. Do not claim that every frame was reviewed or that all product scenarios are covered.

### Disposable Vaults and fixtures

- `release-artifacts/Mneme_Release_Candidate`: release-candidate/manual test Vault.
- `release-artifacts/Mneme_Recorded_Acceptance`: recorded acceptance Vault, using Mock provider; no real API key was copied for recording.
- `Manual Acceptance/` exists in both Vaults. It contains 11 fixtures/guide files: a Chinese guide, English structured note, Chinese structured note, mixed-language note, long English note (13,610 characters), long Chinese note (6,227 characters), Markdown edge cases, low-knowledge noise, two identically named `Retrieval Practice.md` notes in different folders, and a findings log.
- User guide: `release-artifacts/Mneme_Release_Candidate/Manual Acceptance/00-手动验收指南.md`.
- Findings log: `release-artifacts/Mneme_Release_Candidate/Manual Acceptance/99-验收问题记录.md`.
- The recording work did not modify the user's formal `Mneme_ob` Vault.

### What the recorded run established

- Fresh test-Vault installation and Mneme 1.0.0 activation.
- English Mock capture → editable Concept Proposal → accepted Concept Markdown.
- Title edited to `Recorded durable learning` before acceptance; persisted ID is `concept-jngn8gvs`.
- Card generation → editable Card Proposal → accepted canonical Card Group. Edited Front is `What distinguishes durable learning from rereading?`; Card ID is `card-pv6kww7j`.
- Review → Show Answer → Good → completion. The persisted state contains one review event and one FSRS state with `reviewCount: 1`, `lastRating: good`.
- Long English scanning displayed evidence from beginning/middle/later regions in the resulting Proposal. This verifies the Mock chunk/aggregation path, not semantic completeness. The Proposal was rejected.
- Same-title conflict displayed both Existing and Incoming titles/Core Meanings.
- Enter Merge → Back to Conflict Options → Cancel returned to Proposal Review; closing Proposal Review left the item in Inbox.
- The resumed run began with the same pending Proposal still present after the earlier session ended.

Disk state rechecked on 2026-09-05 in `Mneme_Recorded_Acceptance`:

```text
knowledgeProposals: 1
conceptConflictMergeDrafts: 1
conceptMergeRecords: 0
reviewEvents: 1
reviewStates: 1
aiProvider: mock
```

The Concepts folder contains only `Concept-From-Retrieval-Practice.md` and `Recorded-Durable-Learning.md`; no `-2` Concept was created. A saved draft is expected pending state, not an applied merge. The supplementary recording did not exercise final merge confirmation or the manual Create Concept close path.

### Remaining acceptance and publication work

- User judgment of UI polish from the delivered recordings and manual use.
- Real provider extraction quality for English, Chinese, mixed language, long notes, and low-knowledge noise. Mock results cannot close this item.
- Reconcile each row of `CURRENT_VERSION_ACCEPTANCE_CHECKLIST.md` and `V1_RELEASE_CHECKLIST.md` with dated evidence. These older checklists still contain outdated artifact hashes and unchecked installation items; do not copy their status blindly or mark all complete from the narrow recording.
- The macOS clean-install/core-loop path was exercised in the recording. A full plugin reload/Obsidian restart matrix across Inbox, manual Composer, FSRS, controls, and Library is not established by this supplemental recording alone.
- Windows same-artifact validation remains pending. The manifest also declares `isDesktopOnly: false`; the recordings provide no mobile-platform evidence.
- No release publication is established by this handoff. Address remaining release gates before declaring publication-ready.

### Operational notes for continuation

- The recording Vault may not be the active Obsidian window. Verify the Vault name before any test action; the user has other personal Vaults open.
- On 2026-09-04, the CLI initially reported that it could not find Obsidian. Opening the registered Vault with `open -a Obsidian 'obsidian://open?vault=Mneme_Recorded_Acceptance'` restored the correct window; do not interpret that CLI error as a Mneme bug.
- Current UI automation is available through `mcp__cua_repl`; inspect fresh UI state after actions. An earlier computer-use skill cache path no longer exists; discover current tools/skills instead of copying that path.
- `screencapture` and `avconvert` needed approved execution outside the sandbox. Fixed-duration recording and 720p conversion worked. Prior process/session IDs are stale and must not be reused.

## Current Product Direction

Mneme is a focused personal knowledge memory plugin for self-directed lifelong learners. The product loop is:

```text
Source Note
→ Concept
→ Card
→ Review
→ Concept Library
```

ADR 0019 replaces the earlier university/exam-oriented expansion plan. Course Context, Exam Mode, Exam Attempts, Use Mode, Use Projects, AI answer grading, project discovery, and a standalone learning agent are not planned.

AI remains an explicit, bounded assistant for Concept/Card extraction or drafting. Normal review, organization, browsing, scheduling, and export use deterministic local logic and do not call AI. This keeps the product understandable and maintainable with inexpensive API providers.

Knowledge Context Pack and Anki TSV remain ordinary export utilities, not separate modes.

### Recommended next versions

After v1.0 publication gates are complete:

1. **v1.1 Core Loop Friction and Cost** — improve onboarding, provider setup, bounded request transparency, failure recovery, accessibility, performance, and the transitions between capture, Inbox, Concept, and Review.
2. **v1.2 Library Stewardship** — improve Tag management, search/filtering, repair workflows, manual Concept selection for export, and large-library usability.

Candidate work must respond to observed user friction and must not introduce a new learning mode or durable state model.

### Evidence-gated possibilities

A stateless `Rediscover a Concept` entry point may be reconsidered only if real use supports it. It must not create Known/Needs Work state, bypass FSRS, call AI, or become a separate mode.

Lightweight organization may be reconsidered only if Tags, search, Related Concepts, Obsidian organization, and manual export selection prove insufficient. Do not implement Course Context by default.

## Recommended First Actions in the New Session

1. Inspect `git status` and the current diff without modifying it.
2. Read the latest acceptance evidence above and the user's feedback on the recordings; preserve the pending test Proposal/draft.
3. If no concrete defect has been reported, continue the remaining acceptance gates rather than inventing new features.
4. Before product changes, re-read ADR 0019 and the current Product Spec/Roadmap.
5. Scope any fix to observed friction, preserving Concept/Card/FSRS formats and the current simple product loop.
6. After code changes, run appropriate tests, `npm run build`, and the release checks where relevant. Do not repeat the entire suite merely to hand off documentation.

## Paste-ready Prompt for the New Conversation

```text
继续 Mneme Obsidian 插件项目。

项目目录：
/Users/linus/Projects/mneme-workspace/app/mneme

请先完整阅读：
- AGENTS.md
- docs/HANDOFF_NEXT_SESSION.md
- docs/CODEX_BRIEF.md
- CONTEXT.md
- 相关 ADR
- docs/PRODUCT_SPEC.md
- docs/ROADMAP.md
- docs/V1_RELEASE_CHECKLIST.md

注意：当前版本 1.0.0，审查重构分支为 `fix/concept-id-repair-recovery`，审查前备份提交为 `83deb3f`；最新提交请以 git log 为准。请先读 docs/CODE_REVIEW_2026-09-05.md 的已修复与未修复事项。另有长期存在的未跟踪 `mneme` 自链接和 `release-artifacts/`。先只读检查 git status，保留所有现有修改、验收 Vault 与录像。

v1.0 功能已经完成。产品定位已调整为面向自我导向终生学习者的个人知识记忆插件，核心闭环是 Source Note → Concept → Card → Review → Concept Library。

Course Context、Exam Mode、Use Mode、AI Answer Grading、Project Discovery 和内置学习 Agent 已退出产品路线。普通复习不得调用 AI；AI 仅用于用户明确触发、边界清楚的 Concept/Card 提取或草拟。Knowledge Context Pack 和 Anki TSV 只是导出工具，不是独立 Mode。

最近完成的是自行验收与录像交付。两段 720p 录像位于 release-artifacts/，分别为 mneme-1.0-recorded-acceptance-720p.m4v 和 mneme-1.0-conflict-rollback-720p.m4v。录制使用 Mock provider：核心写入/复习流程与冲突返回通过，不代表真实模型的中英文语义质量通过。

录制 Vault 是 release-artifacts/Mneme_Recorded_Acceptance，仍保留 1 个待审 Proposal、1 个合并草稿、1 次 Good 复习；没有产生 -2 Concept。手动测试指南和中英文/长文本/边界样本在 release-artifacts/Mneme_Release_Candidate/Manual Acceptance/。不要误操作我的其他 Vault。

请先核对当前状态和我对录像的反馈，再继续明确的缺陷修复或剩余验收。重点剩余项是真实 provider 内容质量、完整重启回归矩阵及 Windows 验收。不要把旧清单的全部条目自动勾选，不要直接扩展功能或发布。

所有固定 UI 标签使用英文。FSRS 继续完全控制 Card 调度；只有正常 Card Review 中由用户确认的 Again/Hard/Good/Easy 可以更新 FSRS。
```
