# Native first Card Group recovery — 2026-10-02

第四十七轮关闭有限收口清单第 2 项：首次 Card Group 创建中断恢复。基线 `9d98644`，分支 `test/native-first-card-group`。没有产品代码修改。

## 固定范围与环境

macOS / Obsidian 1.13.7，隔离 Vault `release-artifacts/Mneme_Release_Candidate`。开始前备份完整 Mneme 插件/data 和 2,074 份 Markdown hashes。新增 Before、After 两个 Concept，各自声明一个尚不存在的 `Cards.md`。

通过原生快捷切换器打开 Concept，命令面板打开 Create Card；在 Composer 输入 Front/Back，点击 Create Card。临时包装指定路径的真实 `Vault.create` 和该 Concept 的完成状态 `saveData`，仅在下面两个边界挂起。使用官方定向 Vault reload 清除旧运行环境，随后在原生 Composer 点击 Resume Creation。没有调用服务代替用户的创建/恢复点击，没有调用 AI provider，也没有修改个人 Vault。

这两个样例验证 Manual Composer 的首次创建协调器。原生 Inbox 独立 writer 的故障矩阵不在本次固定范围内；旧提案的完整保留由最终数据比较验证。既有 `manualCardWriteRecovery.test.ts` 已覆盖首次创建/已有文件的 intent、Markdown、completion 保存前后故障、重建存储/Vault、重复完成与旧草稿保护。

## 两个检查点

| 边界 | 重载前 | 正式恢复后的结果 |
| --- | --- | --- |
| 首次文件创建前 | pending receipt 和原草稿已保存；`targetExisted=false`；分配 `card-e4vvgvjc`，实际创建 0 次，文件不存在 | pending receipt/草稿跨重载完全保留；Resume Creation 使用原 ID/path，仅创建 1 次，完成状态保存 1 次；最终内容等于首次计划的全部 Markdown |
| 首次文件创建后、完成状态保存前 | 实际创建 1 次，文件含 `card-aa3hzuyt`；磁盘仍为 pending receipt 和原草稿 | receipt/草稿/文件跨重载完全保留；Resume Creation 创建 0 次、process 0 次，只保存 1 次完成状态；文件逐字节不变 |

两次重载后 helper 均不存在，确认旧挂起操作未被继续执行。Composer 显示 pending 提示、原 Concept/Type 与原 Front/Back，提供 Resume Creation。成功后显示对应 `Created: <id>`，旧草稿清除，draft ID 轮换，Create Card 恢复可用。

最后恢复计数包装已还原，helper 已删除，Composer `isSaving=false`。一次收尾 CLI 因自动审批额度不足未执行；续接后清理成功，不影响恢复结果。

## 最终验证

`release-artifacts/native-first-group-20261002/verify-final.py` 断言通过：

- 原 2,074 份 Markdown 全部 hashes 不变；两份新增 Concept 与 fixture 正文逐字节一致。
- 恰好新增两份 Cards.md，总 Markdown 数 2,078；每组恰好一张 Card，两张新 Card ID 在整个 Vault 中各出现一次。
- Before 最终全文等于创建前计划；After 最终全文等于中断前文件；receipt 除 pending → written 外均不变。
- data.json 仅 `manualCardDraftId` 与 `manualCardWrite` 两个字段改变。旧 Inbox 提案、评分及事件、设置、来源、其他作者状态全部不变；没有残留 manualCardDraft 或 pending 创建。
- 仓库、安装和开始前备份的 main.js SHA-256 一致：`f1c9b9823b79b88e044dc0da4ecfc52480d8fa2b70483b98aefe44c334924fd6`。

证据目录中保留 `Before/After-held.json`、`Before/After-reloaded.json`、`Before/After-completed.json`、最终快照、脚本和备份，均为本地未跟踪验收产物。

`npm run build`、`npm run test:markdown-writer`（包含 Manual Card recovery）和 `git diff --check` 通过。日志为 `/private/tmp/mneme-first-group-build.log`、`/private/tmp/mneme-first-group-writer.log`。

本轮是隔离 Vault 运行环境重载，未终止整个 Obsidian；不声称主进程崩溃、写入撕裂、断电或同步竞争已经验证。两项固定边界完成后，第 2 项关闭，不再扩矩阵。下一步仅执行冻结产物的一次干净安装、核心闭环与重启冒烟，通过即结束本轮收口。
