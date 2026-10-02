# Frozen release smoke — 2026-10-02 至 2026-10-03

第四十八轮基线 `4a42a06`，分支 `test/frozen-release-smoke`。有限收口清单第 3 项全部通过：干净安装、核心闭环及完整主进程重启后的数据核对均完成。本轮审查重构验收已收口。没有修改产品代码。

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

## 完整重启与最终核对（2026-10-03）

用户明确授权退出并重开整个 Obsidian。多次原生 Quit 后旧主进程仍存在；TERM 请求最初被自动审批拒绝。用户随后明确授权“允许 TERM 终止后重开”，才向核实的主进程 `98171` 发送 TERM。`ps -p 98171` 返回无进程后重新启动应用，新主进程为 `92975`，测试 Vault renderer 为 `92986`。这次是真正的主进程重启，退出方式是经授权的 TERM，不记为正常 Quit 成功或断电测试。

重启后官方 CLI 确认测试 Vault 路径正确，Mneme 1.0.0 已加载。原生 Library 显示一个 Stable Identity；Review Cards 显示 `Card 1 of 1 · Reviewed 1 time`，Show Answer 显示审批后的正确答案。没有再次评分或审批。

`verify-final.py` 和 `final-verification.json` 核对通过：

- 三份 Markdown 的路径集合和 SHA-256 与重启前完全一致，无新增重复文件。
- 完整 data.json 对象与重启前完全一致，不仅比较评分数量。
- 两条提案均 written；恰好一份 FSRS state、一条 Good event，reviewCount=1；Card ID 在整个测试 Vault 只出现一次。
- 冻结目录、已安装目录、仓库三份发布产物的 SHA-256 均匹配冻结 manifest。
- 仅启用 Mneme 一个社区插件；Provider 为内置 Mock，没有外部模型请求。

本地证据目录 `release-artifacts/frozen-smoke-20261002/` 保存产物 manifest、两次审批前状态、重启前 data/Markdown hashes、`restart-processes.json`、最终 verifier 和结果。准备阶段独立 profile 实例 PID 82783 因 UI 工具无法选中而退出，未参与上述闭环或重启证据；所有实际验收使用新隔离 Vault。没有主动编辑个人 Vault 内容。

## 收口结论

构建、发布文件检查、最终数据与产物断言及 diff 检查通过。构建日志 `/private/tmp/mneme-frozen-build.log`。本轮没有修改产品代码，没有重复历史故障专项或全量测试。

有限清单三项全部关闭，本轮代码审查与重构验收结束。性能优化、真实 provider 输出质量、Windows/mobile 和断电/同步竞争仍属于独立优化或发布任务；不自动追加为本轮验收，也不把本次结果解释为跨平台发布认证。
