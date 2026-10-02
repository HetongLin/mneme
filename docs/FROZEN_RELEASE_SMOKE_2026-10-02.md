# Frozen release smoke — 2026-10-02

第四十八轮基线 `4a42a06`，分支 `test/frozen-release-smoke`。有限收口清单第 3 项进行中：干净安装与核心闭环通过，重启后验证尚未执行。没有修改产品代码。

## 冻结产物

从基线构建并通过 `npm run check:release -- 1.0.0` 后，将三份发布文件复制到 `release-artifacts/frozen-smoke-20261002/frozen-plugin/`。后续安装使用该目录的原样副本：

| 文件 | SHA-256 |
| --- | --- |
| main.js | `f1c9b9823b79b88e044dc0da4ecfc52480d8fa2b70483b98aefe44c334924fd6` |
| manifest.json | `23d6f036fdba51e4b4dc8c29b4ebc0d021fe8dfd506f7037f35ed2ba2cf5a0e8` |
| styles.css | `f20f5c5354a3c1aae67f573342fcb064cb362499ee9503fe9b14f19d1f2d3250` |

新 Vault：`release-artifacts/frozen-smoke-20261002/Mneme_Frozen_Smoke`。初始只有一份 Source.md 和三份插件文件，没有 data.json，没有复制旧 Vault 的配置、提案、笔记或评分。

## 已完成的原生检查

在 macOS Obsidian 1.13.7 通过 Manage vaults → Open folder as vault 打开新目录，确认本地构建并启用 Mneme v1.0.0。进入设置，启用 AI capture，使用默认内置 Mock Provider；无外部 API 请求。

1. 打开 Source.md → Analyze Current Note：生成一条 Concept 提案；磁盘仍只有 Source.md。
2. Open 提案，在 Review Gate 将标题改为 Stable Identity，Core Meaning 改为来源中的具体含义，再 Accept & Next：生成 `Mneme/Concepts/Stable-Identity.md`。
3. Library → Generate to Review：产生一条 Card 提案；磁盘仍只有 Source 和 Concept，无 Cards.md。
4. Open Card 提案，把 Back 改为已批准 Concept 的含义，再 Accept & Next：生成 `Mneme/Cards/Stable-Identity/Cards.md`，自动进入 Review，显示正确 Front/Back。
5. Show Answer → Good：显示 Review complete / 1 card reviewed。磁盘恰好一个 `card-8xu9q3kt` FSRS state 和一条 Good event，reviewCount=1。两个提案均 written。

开始前来源正文：

> A stable identity remains unchanged when a note title or file location changes. Keeping identity separate from presentation preserves links and review history.

批准的 Core Meaning 和 Back：

> A stable identity stays unchanged when a title or file location changes, preserving links and review history.

## 唯一剩余步骤

重启后核对三份 Markdown hashes、完整 data.json、产物 hashes，并观察 Mneme 页面正常加载；不再提交评分或重复审批。

原计划用 `--user-data-dir` 独立实例执行主进程重启；实例 PID 82783 确认使用专属 profile，但原生操作工具仍绑定原 Obsidian 实例，无法操作新实例。该空测试实例已定向 SIGTERM 关闭，没有打开任何 Vault，没有作为重启验收证据。随后所有实际闭环操作在原实例的新隔离 Vault 完成。

已询问用户是否允许退出/重开整个 Obsidian，或改为仅测试 Vault 关闭重开。个人 Vault 仍在使用，未获答复前不执行整个应用退出，不将 Vault reload 记为完整应用重启。最后一次 CLI 诊断返回无法找到 Obsidian，未获得 PID 证据；原生 UI 和磁盘核对正常。后续只解决这一个重启步骤，不重跑安装或核心闭环。

本地证据：`artifact-manifest.json`、`concept-before-approval.json`、`card-before-approval.json`、`before-restart-data.json`、`before-restart-markdown.json`。构建日志 `/private/tmp/mneme-frozen-build.log`。已通过构建、发布文件检查与 diff 检查；本轮没有重复历史故障专项或全量测试。
