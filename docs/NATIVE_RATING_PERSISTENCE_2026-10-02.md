# Native rating persistence acceptance — 2026-10-02

本报告关闭本轮有限收口清单的第 1 项：评分保存失败与中断。没有产品代码修改，不扩展其他验收矩阵。

## 环境与边界

- 基线提交：`75cbd38`；分支：`test/native-rating-persistence`。
- macOS / Obsidian 1.13.7；仅使用 `release-artifacts/Mneme_Release_Candidate` 隔离 Vault。
- 安装、仓库构建及开始前备份的 `main.js` SHA-256 均为 `f1c9b9823b79b88e044dc0da4ecfc52480d8fa2b70483b98aefe44c334924fd6`。
- 备份完整插件目录/data.json，以及 2,068 份原 Markdown hashes；新增 Failure、Before、After 三组 Concept/Cards，共六份 Markdown，每组两张 Card。
- 原生 UI 执行 Review、Show Answer、Good。临时包装真实 `plugin.saveData`，仅一次生效，随后还原原方法；不模拟 FSRS 或 Store。故障前/后暂停位置在真实磁盘保存的外侧。
- 使用官方 `obsidian vault=Mneme_Release_Candidate reload` 中断挂起的运行环境。两次重载后 `globalThis.r46` 均不存在；renderer PID 仍为 3598。这是 Vault 运行环境重载，不是主进程终止、完整应用崩溃或断电测试。

## 固定的三个检查点

| 检查点 | 观测结果 | 结论 |
| --- | --- | --- |
| 保存前报错，然后同会话重试 | 报错实际写入 0 次，完整 data.json 字节不变；显示 `Could not record review`，保留 Card 1/2 和答案。重试实际写入 1 次，进入 Card 2/2，state/event 各 1 | 通过 |
| 保存前挂起，然后重载 Vault | 调用保存边界时尚未实际写入，完整 data.json 字节不变，UI busy 且 index=0。重载后 `r46-before-one` 无 state/event，之前成功评分保留 | 通过 |
| 保存完成、返回 UI 前挂起，然后重载 Vault | 实际保存 1 次，磁盘已有完整 state/event，UI 仍 busy 且 index=0。重载后 `r46-after-one` 的 state/event 各 1，未自动重放 | 通过 |

原生页面重载后回到可操作的 Today’s Focus：Before 两张未评分卡仍可复习；After/Failure 各显示一张当前待复习卡及一张已评分卡。没有进一步评分。

开始时旧 Review 弹窗显示与当前 View 内容不一致；在注入故障前定向重载隔离 Vault 后恢复。没有将该准备过程计为中断检查，没有据此归因产品缺陷。期间一次 CLI 请求因自动审批额度不足未执行，恢复后重新执行成功。

## 最终数据核对

`verify-final.py` 对备份、磁盘最终数据和各检查点证据执行断言：

- 原 2,068 份 Markdown hashes 全部保持不变；六份 fixture 与预置正文逐字节一致，总数 2,074。
- 仅新增 `r46-failure-one` 和 `r46-after-one` 的两份 FSRS state、两条 Good event，reviewCount 均为 1。
- 去除这两次预期评分后，完整插件 data 与开始前对象完全相同；旧评分、设置和所有其他状态保留。
- 两次重载都清除了 helper；最后的运行环境没有临时故障钩子。
- 仓库、已安装、备份三份 bundle hash 一致。

证据目录：`release-artifacts/native-rating-persistence-20261002/`。关键文件：`save-failure.json`、`retry-success.json`、`before-write-held.json`、`after-before-reload.json`、`after-write-held.json`、`after-after-reload.json`、`final-verification.json`、`verify-final.py`。证据含测试 Vault 备份，留在未跟踪的本地产物目录。

## 验证与退出条件

- `npm run test:review-state` 通过（`/private/tmp/mneme-rating-persistence-state.log`）。
- `npm run build` 通过（`/private/tmp/mneme-rating-persistence-build.log`）。
- 原生三个固定检查点、最终数据断言和 `git diff --check` 通过。

第 1 项关闭。后续只执行首次 Card Group 创建中断、冻结产物的干净安装/核心闭环/重启冒烟两项。未验证写入中途撕裂、断电或跨进程/同步竞争；这些不转化为本轮新增阻塞验收。Windows/mobile 与正式跨平台发布要求另行安排。
