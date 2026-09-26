# Mneme Next-Session Hand-off

Updated: 2026-09-26

## 2026-09-05 至 09-26 代码审查后续

- 第三十五轮从 `dc35abd` 继续，在 `test/incoming-merge-entry-ui` 完成 Inbox/Manual 的完整冲突 Merge 入口验收，修复提交 `74e021b`。发现 Manual 在未编辑内容、仅 Cancel → Back → Merge 时误报 incoming revision 变化；Composer 每次 flush 更新时间，而 UI fingerprint 包含完整 draft。现在复用 `manualConceptDraftHash`，忽略保存时间、沿用 trim 语义，仍核对内容、身份、目标及来源 hash。receipt/origin hash、预览和写入恢复校验未变；旧 fingerprint 升级首次可能保守提醒一次，原草稿保留。规则补入 ADR 0021。
- 通过真实 DOM 控件从 Inbox Open → Accept & Next → 重名冲突 → Merge，以及 Composer 输入 → Create Concept → 冲突 → Merge，验证取消零 Markdown 写入、Back 返回后重新创建页面并保留草稿、无临时 Concept。Inbox/Manual 各注入正文已写后 completion save 单次失败；正式 Resume 均完成。Inbox pending 经插件重载捕获真实 Incoming 启动通知，保留提案且不自动完成；Manual 恢复将打开的 Composer 切为空白新身份草稿，Merge 页面完成且非忙碌。
- 修复构建用第三个样例复测：只有 updatedAt 改变时恢复正常，真实 Core Meaning 改变仍提醒且保留旧 Merge 文本；编辑并确认后正常完成。测试脚本曾持有 Back 前已关闭的旧 View、以及取消回调尚未更新按钮时尝试点击，均已重新定位/等待后继续，未误计为产品故障。详见 [Incoming 入口 UI 验收报告](NATIVE_INCOMING_ENTRY_UI_2026-09-26.md)。
- 44 份旧 Markdown hashes 保持不变，恰好新增三份样例，最终字节均匹配确认计划。原设置、复习、提案和旧来源记录保留；最终 data 仅 incoming receipt、Manual draft ID、来源链接/分析索引四个顶层字段变化。Manual Composer 自动选中旧测试指南作为 Source，确认产生一条新来源链接和一条分析索引，原指南正文未变；最后无来源的空草稿在关闭时正常清理。无 pending/journal，故障包装通过最后重载移除。证据 `release-artifacts/incoming-entry-ui-20260926/`。
- 全量测试、构建、发布检查通过；新增测试类型收窄修正及 harness 简化后，专项与独立 TypeScript 检查通过，独立复审无阻塞项。日志 `/private/tmp/mneme-incoming-entry-{all,build,release,focused,test-types}.log`。当前隔离 Vault main.js SHA-256 `6aa7777393d8735456612a9c2ba8de72dcc0a9ed5dcd09ad263daa35380c0da4`；保留 `mneme` 与 `release-artifacts/`，未推送或修改个人 Vault。
- **下一步**：进入真实 Card 评分/创建的进程重启验收，再扩展删除与 ID repair；优先验证评分后的 FSRS/history 持久化和创建完成保存失败后的恢复。Incoming 两种 origin 的其余原生中断边界（含 Manual pending 的单独启动通知）、真实 provider、Windows/mobile 仍待覆盖。本轮启动通知使用 Inbox origin；插件重载不是进程重启，DOM 驱动不是物理操作或截图视觉 QA，不代表整个发布清单完成。

- 第三十四轮从 `da38eaf` 继续，在 `test/native-merge-recovery-ui` 完成部分原生恢复 UI 验收（09-24 执行，09-26 收尾提交），修复提交 `183cb1d`。Incoming Merge 恢复成功时现在清理 `isWorking`；原实现遇到旧异步草稿操作等待，会显示完成页但残留 busy。没有证据表明它会阻止新会话或损坏内容，不应夸大为 UI 完全卡死。
- 通过 Obsidian CLI 驱动真实 renderer DOM 的选择、草稿、预览与确认按钮，验证 Guided 取消零写入、首文件写后报错、正式 Resume 更新原完成页、重复恢复不重写。另一组 pending 经插件重载出现实际启动通知，Resume 后完成。确认框位于另一活动 popout，按实际窗口 DOM 定位。插件重载后空选择页面未被错误认领。
- Incoming 的旧/新构建各用独立提案：确认后正文已写但 completion save 报错，开始本地延迟 AI 草稿，再执行正式 Resume。旧构建完成后 busy 仍 true；修复构建立即 false，旧结果结束后完成页不被覆盖、已消费草稿不复活。新增回归实际挂起 AI 草稿方法的 read await，并检查不匹配 receipt 不解锁；旧实现红灯、修复绿灯，独立复审无阻塞问题。
- 六份新增测试 Markdown 的最终内容与确认内容一致，38 份旧 Markdown hashes 全部保留。最终 data 仅三个顶层字段有变化：新增两条 Guided Merge Record（旧记录保留）、两种 Merge receipt；其余作者状态、设置、提案、草稿、复习及来源数据一致。无 pending/journal；最终插件重载移除测试钩子。证据保存在 `release-artifacts/native-recovery-ui-20260924/`，详见 [原生恢复 UI 验收报告](NATIVE_MERGE_RECOVERY_UI_2026-09-24.md)。
- 当前构建已安装到隔离 Vault，main.js SHA-256 `003b4deb701770d80a3c0fc44639689cd8e15417da745a3649dfdeda10b0e5b1`。全量测试、构建、发布检查、修改测试的独立 TypeScript 检查及 diff 检查通过，日志 `/private/tmp/mneme-recovery-ui-{all,build,release,test-types}.log`。保留未跟踪 `mneme` 与 `release-artifacts/`，没有推送或修改个人 Vault。
- **下一步**：补 Incoming 启动提示及 Inbox/Manual 完整入口 UI 路径；随后继续真实 Card 评分与创建、删除、ID repair 的进程重启矩阵。Incoming 两种 origin 的其余中断边界、真实 provider 内容质量、Windows/mobile 仍待验收。本轮无真实 provider 调用、无新进程重启、无 Card 评分；DOM 驱动不等于物理鼠标/键盘或截图视觉验收，插件重载不等于主进程重启，不要自动勾完发布清单。

- 第三十三轮从 `497dd36` 继续，在 `test/native-merge-recovery` 完成 macOS Obsidian 1.13.7 的专项中断恢复验收，并修复恢复冲突的误导提示，代码提交 `0f7d97d`。原提示要求重建预览，但 pending 会阻止新预览；现在明确保留当前文件和快照，先检查冲突再恢复。协议和文件/状态行为未改。
- 在 `Mneme_Release_Candidate` 新增 17 个专用样例文件；旧插件/data、旧 Markdown hashes、故障脚本、每次预期写入和结果保存在 `release-artifacts/native-recovery-20260924/`。测试通过原生服务和正式 CLI 命令进行；不是点击确认 UI。Guided Partial 经 CLI restart 只更换 renderer（主 PID 未变）；其余 Completion、Conflict、Incoming Inbox、Incoming Manual 均强制终止并重开主进程，记录不同 PID。不要把第一项算作完整应用重启。
- Guided 部分写入恢复、全部写完但状态未保存、外部编辑冲突均通过。Conflict 保留现场，撤销的仅是本轮注入句子，未改 receipt hash，随后完成。Inbox 已写正文后只补状态，View 无重复；Manual 尚未写入时返回 not-applied、保留草稿且拒绝旧确认。临时草稿测试后恢复原草稿。原有笔记、作者状态、设置、复习/来源记录全部核对保留；最终无 pending Merge，无残留 journal。详见 [原生恢复验收报告](NATIVE_MERGE_RECOVERY_2026-09-24.md)。
- 当前构建已安装在隔离验收 Vault，main.js SHA-256 `76a0cc986118a09ee04a7050a745495ffcf17b8b18c338dc5e77d1e058baa0b2`，备份仍在；没有改个人 Vault、旧录制 Vault 或推送。全量测试、构建、发布检查及 diff 检查通过，日志 `/private/tmp/mneme-native-recovery-{all,build,release,focused}.log`。
- **下一步**：补原生 UI 确认/启动提示/打开中 Merge View 恢复展示，以及真实 Card 评分与创建、删除、ID repair 的重启矩阵；Incoming 两种 origin 的其余中断边界、真实 provider 内容质量、Windows/mobile 验收仍未覆盖。本轮使用预置复习状态验证保留，没有通过 Review UI 产生评分；未验证写入撕裂、断电持久性或同步竞争。不要自动勾完发布清单。


- 第三十二轮从检查点 `14f3ff4` 继续，在 `fix/guided-merge-durable-recovery` 完成多文件 Guided Merge 的持久化恢复，代码/测试/ADR 提交 `47fcbd6`。预览仍零写入；确认后在插件目录写入并回读校验独立 JSON journal，再保存不含正文的 `guidedConceptMerge` intent。中断后保留已完成文件，不再自动回滚。
- 新增 **Resume Guided Merge** 命令和启动提示。恢复先校验全部目标均为已确认的 before/after，跳过已写文件，继续剩余原子写入；Related 检查用受影响文件的原快照与其他文件的当前内容，并重新核对原生解析。全部完成后，从当前 data 重算来源、linked IDs、pause、duplicate dismissals 和 Merge Record，连同 written 状态一次保存。保留期间新增的设置、Card FSRS 状态与事件；重复恢复不重放内容或状态。
- 保护重叠 Inbox/Manual/Incoming Merge、删除、ID repair、来源变更及清理，包含其恢复分支；检查旧 Source link owner，避免通过改 owner 绕过。恢复记录还校验快照中的实体身份、Card ID 清单和合并时间；兼容旧 ID 的冒号/点号。命令完成后，只更新两方 ID + path 都匹配的打开页面，并使旧异步操作失效。协议和保留规则见 [ADR 0031](adr/0031-guided-merge-resumes-reviewed-file-writes.md)。
- 第三十二轮最终验证：`npm run test:all`、`npm run build`、`npm run check:release -- 1.0.0`、新增四份测试的 TypeScript 检查及 `git diff --check` 均通过。覆盖两个 Concept、两个 Card Group、一个 Related 邻居共 5 次写入的生效前/后 10 个故障点，以及 journal/intent/completion 的生效前/后 6 个边界；每次重建存储、journal 和服务。还覆盖冲突零追加写入、记录/快照损坏或缺失、原生解析变化、清理失败重试、幂等、状态保留和 View/命令。日志 `/private/tmp/mneme-guided-recovery-{all,build,release,focused,test-types}.log`（临时文件，不是永久证据）。
- **下一步**：在一次性 Obsidian Vault 进行 Incoming/Guided Merge 的受控中断、真实进程终止/重启、命令与缓存时序验收；先备份测试 Vault 插件和 data，至少覆盖部分文件已写、全部文件已写但状态未保存、外部编辑冲突三类情况。还需继续 Card/FSRS、创建/删除/ID repair 的原生重启矩阵、真实 provider 内容质量及 Windows 验收。不要把第三十轮的原生证据当成本轮恢复验收。
- **边界**：schema version 仍为 1，新增字段可选；Card 正文和 ID 未改。journal 保存确认内容的临时副本，成功后删除；清理失败可重复 Resume，intent 保存前遗留的 orphan 不自动删除。历史无 receipt/journal 的部分合并不能认领。Markdown 与 data.json 不具备跨文件原子性；外部编辑、同步、未受保护的正文操作、库存或关联解析变化会使恢复停止，保留现场。没有强制完成、自动回滚或冲突解决 UI。本轮未安装到已有验收 Vault，未修改个人 Vault；保留未跟踪 `mneme` 与 `release-artifacts/`。


- 第三十一轮从检查点 `ba43fba` 继续，在 `fix/incoming-merge-completion-recovery` 完成单文件 Incoming Merge 的持久化完成恢复，代码/测试/ADR 提交 `92276cc`。预览仍零写入；确认后先保存不含正文的 `incomingConceptMerge`，再以原子 process 写 Concept，最后一次保存完成 Proposal 或轮换 Manual draft、来源索引和 written 记录。
- 新增命令 **Resume Incoming Concept Merge**，启动只提示。恢复时目标与 afterHash 相同则只补状态；与 beforeHash 相同则标记 `not-applied` 并保留草稿，要求重新预览；终止记录防止旧确认重放。目标、身份或来源改变、记录损坏时保留现场并停止。相等 before/after 按完成处理。重复恢复不追加正文、不重复轮换草稿，最后一条终止记录可由下一次确认替换。
- Pending 来源的 Proposal/Manual draft/冲突草稿受保护，cleanup 不移除其 Proposal；重叠 Inbox 写入、Guided Merge、Concept 删除/ID repair 的入口与恢复路径会阻止。恢复按当前状态补齐，保留期间新增的复习、设置及来源分析 metadata；打开中的匹配 Merge View 显示完成，不再执行排队中的草稿保存，Composer 只刷新被消费的草稿身份。详见 [ADR 0030](adr/0030-incoming-merge-recovers-completion-without-replaying-markdown.md)。
- 第三十一轮验证：全量测试、构建、发布检查、diff 检查通过，三份新增测试另做 TypeScript 检查通过。Inbox/Manual 各覆盖 intent save、Markdown process、completion save 的生效前后六类故障，共 12 个矩阵场景；JSON 重建存储与服务、幂等重复、not-applied 后旧 plan 拒绝、等哈希、来源/目标变更、无关状态保留、保护入口、View 与命令回归均通过。原 `ba43fba` 服务回放新测试按预期失败于缺少 completion receipt。日志 `/private/tmp/mneme-incoming-recovery-{all,build,release,focused,state,test-types,baseline}.log`。
- **下一步**：设计多文件 Guided Merge 的持久化 intent/恢复协议；不能直接套用本轮“未写入则回预览”的单文件方案，因为 Guided 可能只完成部分 Concept、Card Group 和 Related 邻居。另需在一次性 Obsidian Vault 验收本轮命令、真实进程中断/重启与来源冲突处理。本轮没有安装新构建到已有验收 Vault，第三十轮原生证据不代表本轮恢复已做真实重启验收。
- **边界**：未改 Card 正文/ID/FSRS；schema version 仍为 1，新增字段可选。Markdown 与 data.json 并非跨文件原子提交；外部编辑、同步及未纳入保护的其他正文操作可能使 receipt 哈希失效，此时停止而不覆盖。历史无 receipt 的部分合并不能自动认领，没有强制完成、自动回滚或 UI 手工解决冲突流程。保留未跟踪 `mneme` 和 `release-artifacts/`。

- 第三十轮从检查点 `c192e8f` 继续，在 `test/native-merge-acceptance` 完成一次真实 macOS Obsidian 1.13.7 专项验收；发现并修复完成页详情使用旧 Concept summary 的问题，代码/测试提交 `49f53d1`。`openConceptDetail` 从传入扫描列表按 ID + exact path 取当前对象，详情及创建/删除回调保持一致；找不到则提示刷新，不按 ID 或路径单独回退。
- 隔离 Vault 为 `release-artifacts/Mneme_Release_Candidate`；当前构建已安装并重载，仅新增 `Refactor Acceptance 20260922/` 测试笔记。旧插件/data、旧 Markdown hashes、初始 fixtures、构建哈希和核验结果保存在 `release-artifacts/refactor-acceptance-20260922/`。保留这些文件；没有修改个人 Vault 或旧录制 Vault。
- 真实 native resolver 确认普通 Reader 的 Topic 与 Concept Neighbor 的 Topic 指向不同文件；通过原生 popout UI 验证取消预览零写入、确认合并仅重连真正邻居、redirect 属性/正文与阅读模式导航保留。旧实现完成页 Related(0) 而刷新 Library Related(1)；修复后第二次合并完成页立即显示 Related(2)，2026-09-23 插件重载后仍为2，两个源 Concept 已从活跃列表排除。旧 Markdown、提案、草稿和复习状态核对未变。全量测试、构建、发布检查、diff 检查与独立复审通过。
- 详细证据见 [原生验收报告](NATIVE_MERGE_ACCEPTANCE_2026-09-22.md)。最终 main.js SHA-256 为 `721de42384e62e392c8a71d4a1b4bb0de3b0213ad1c397f36fe48b9d016ee402`。本轮无 Card/AI 请求，插件重载不等于进程重启；不得据此标记整个发布清单通过。**下一步**：Incoming/Guided Merge 持久化恢复设计与实现；补 Card/FSRS 和创建/删除/身份修复的真实中断重启矩阵；Related 相对/后缀路径、大小写、多个章节仍待独立审查。

- 第二十九轮从已提交检查点 `1de69c8` 继续，代码/测试/ADR 提交为 `3d3affc`，分支为 `fix/merge-concept-redirect-content`。确认并修复源 Concept 被整份 redirect 模板覆盖的问题：自定义 YAML 全丢，未复制到 View 的正文也消失。新增 `conceptMergeRedirect.ts` 基于原文做局部身份编辑，保留自定义属性、别名、列表/嵌套/块值、注释及全部原正文；正文留在原路径，两种 preserveMergedAsView 设置都保留。
- `mneme_type` 改为 `concept_redirect`，`mneme_id` 改键为 `former_mneme_id` 并保留原值/注释，规范化版本并添加合并目标/时间/导航。顶部 notice 先于原正文，避免被未闭合围栏或注释隐藏。旧 cards/learning 等属性作为历史内容保留，当前 scanner 依类型排除 redirect；survivor 的 View 复制仍独立受原引用检查约束。已有 redirect 元数据、重复/复杂/多行受管字段阻止准备，不静默覆盖。
- 第二十九轮验证：全量测试、构建、发布检查、diff 检查及独立复审通过。原实现红灯复现丢失 aliases；新增测试覆盖 LF/CRLF × preserve true/false、自定义 YAML 字节、原正文/相对附件/锚点、身份退役、带引号值和注释、四种元数据冲突、版本重复/块值/缩进与无缩进列表、未闭合 fence/comment、无 EOF 换行、预览后改动与保存失败回滚。日志 `/private/tmp/mneme-concept-redirect-all.log`、`/private/tmp/mneme-concept-redirect-build.log`；红灯 bundle `/private/tmp/mneme-concept-merge-redirect-red2.mjs`。规则见 [ADR 0003](adr/0003-concept-merge-requires-guided-review.md)，DATA_MODEL 和 Merge 确认文案同步。
- **下一步审查边界**：Related qualified 相对/后缀路径、大小写冲突和多个 Related 章节；真实 Obsidian 原路径导航/属性/Concept 列表验收；Incoming/Guided Merge 持久化恢复。本轮只保留文件内容并退役身份，不重写历史链接，也不引入完整 YAML 解析、持久 schema 或跨进程恢复。

- 第二十八轮从已提交检查点 `a05d506` 继续，代码/测试/ADR 提交为 `64472f3`，分支为 `fix/merge-related-source-context`。抽出 `conceptMergeRelated.ts`，修复 Guided Merge 用 Concept-only basename 索引误认关系：裸 Related 按所在笔记调用 native resolver，解析到普通笔记或未解析目标时不认作 Concept；缺 resolver 时阻止裸链接处理。明确目录继续保留原精确规则。
- 迁移 source 的普通/未解析裸链接时，比较原来源与 survivor 中实际输出拼写的目标（包括去掉 `.md` 后的拼写）；目标不同则停止。生成根目录 Concept 链接也须在接收笔记解析到所选文件。plan 新增仅内存的 `relatedChecks`：记录 Markdown 文件清单、类型/ID、Concept Related targets 及观察到的 native 解析结果。execute 全部读取结束后复查，包括未写入的 reader；每次正向 atomic transform 再查 native 结果，补偿仍使用原字节保护。
- 第二十八轮验证（2026-09-22）：全量测试、构建、发布检查、diff 检查通过；新增回归覆盖普通同名目标不重连、正常 Concept 重连、未解析关系保留、源/目标上下文不同和缺 resolver 阻止、根目录链接成功/错误/未解析、预览后未写 reader 的关系或解析变化、普通目标变成 Concept、新增文件、无关普通正文编辑保留，以及首/第二次写入时变化与回滚。日志 `/private/tmp/mneme-merge-native-focused.log`、`/private/tmp/mneme-merge-native-all.log`、`/private/tmp/mneme-merge-native-build.log`。规则见 [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md)。
- **下一步审查边界**：qualified 相对/后缀路径、大小写冲突、多个 Related 章节、源 Concept 自定义 YAML/redirect 保留策略。真实 Obsidian 缓存/渲染验收与 Incoming/Guided Merge 持久化恢复仍待完成。本轮检查不构成 Vault 全局原子快照；preflight 后外部身份/内容变化及缓存延迟仍有限制，未新增持久 schema 或跨进程锁。

- 第二十七轮从已提交检查点 `58e8bcd` 继续，代码/测试/ADR 提交为 `8380f2d`，分支为 `fix/related-scan-resolution`。修复界面共用 ConceptScanner 的错误关系识别：未知 `Missing/Beta` 不再丢目录后匹配 `Archive/Beta.md`；裸链接不再优先绑定根目录 Concept 或仅按 Concept 集合中的唯一 basename 猜测。
- ObsidianConceptVaultAdapter 接入 metadataCache source-context resolver；scanner 对裸链接（含根目录文件名）按实际 canonical 目标查当前有效 Concept 集合，普通笔记、未解析目标、被身份校验排除的文件不产生关系。缺 resolver 时不回退猜测。明确目录保留既有精确规则，对称显示、自链接过滤和 ID 去重保持；移除旧 basename index。详情导航、关系计数和管理列表继续使用同一 `relatedConceptIds` 数据，无 Markdown/持久字段修改。
- 第二十七轮验证：全量测试、构建、发布检查、diff 检查通过。旧 scanner 分别复现未知目录产生虚假双向关系，以及 native 指向 Archive/Beta 却显示 root Beta；回归覆盖其他目录/根目录/普通笔记/未解析目标、resolver 缺失，即便唯一同名 Concept 也不猜测。真实 scan → RelatedConceptService 添加/移除 → rescan 验证两个同名关系可并存，移除选中关系后另一裸链接、别名和目标文件保持不变。日志 `/private/tmp/mneme-related-scan-all.log`、`/private/tmp/mneme-related-scan-focused.log`、`/private/tmp/mneme-related-scan-directory-red.log`、`/private/tmp/mneme-related-scan-context-red.log`。规则见 [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md)。
- **当时的下一轮修复项（已由第二十八轮处理）**：Guided Merge 仍绕过 native resolver，用仅含 Concept 的索引识别 Related。具体风险：待合并的是 `Concepts/Topic.md`，另有普通笔记 `Topic.md`，Reader 的 `[[Topic]]` 实际打开普通笔记，却会被 Merge 识别为参与者关系并重连。迁移 source 的裸 Related 到 survivor 还可能改变解析上下文；不能仅替换一个 matcher，需要记录/复查解析决策（包括未写文件、普通目标和来源/目标上下文）并保护预览后的变化。界面仍是扫描快照，外部修改后需刷新；qualified 相对/后缀路径、大小写冲突、多个 Related 章节、真实 Obsidian 验收与 Merge 持久化恢复继续待办。

- 第二十六轮从已提交检查点 `8394c5a` 继续，代码/测试/ADR 提交为 `e13daa7`，分支为 `fix/related-source-context`。手动 Related 和 Concept 删除不再按文件名猜测裸链接归属：共用 `relatedConceptResolution.ts`，用链接所在 Markdown 路径调用 Obsidian metadataCache resolver。解析到其他同名文件时保留原文且不抑制明确关系；同名裸链接无法解析时阻止并提示使用完整路径。新生成的根目录裸链接也须解析到所选目标。
- 两个手动关联入口、删除准备与恢复入口均注入 metadataCache。手动 execute 在全部读取结束后同步复查两侧（含 no-op），并在每次正向 atomic transform 内再检查；补偿仍按原字节快照恢复，不依赖新解析。删除 plan 新增可选内存 `relatedChecks`，含未改动笔记，保存 intent 前核对内容并重算；恢复用同一 matcher 且必须符合已保存 afterHash，process 内也复查，已达到 afterHash 的文件直接跳过。
- 第二十六轮验证：全量测试、构建、发布检查、diff 检查通过；复审发现两侧都是 no-op 时第一侧解析可在第二次 read 期间改变，已加入红/绿回归并修复，复查通过。覆盖同名不同目录、解析缺失、目标根目录、prepare 后两种决策反转、atomic transform 前变化、真实 prepare → delete、intent 保存后报错的 resume、混合裸/明确链接保留和已应用关系不再需要 resolver。继续操作时旧临时进程/日志已不可用，2026-09-21 重新运行完整验证；最终测试日志 `/private/tmp/mneme-related-context-all.log`。
- 规则见 [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md) 和 [ADR 0026](adr/0026-concept-deletion-resumes-from-durable-staging.md)。持久 receipt schema 未变；旧 pending 删除若原宽松 matcher 产生不同结果会安全停止，不修改原 hash 强行完成。**后续边界**：Guided Merge 和 UI 关系展示仍用各自索引/匹配规则，需审查与 Obsidian source context 的一致性；qualified 相对/后缀路径、原大小写折叠、多个 Related 章节仍待审查。删除未改动笔记的检查只在 intent 前，不是持久锁；缓存延迟、保存 intent 后外部变化/新增笔记及跨进程互斥不由本轮保证。真实 Obsidian 验收与 Merge 持久化恢复仍待完成。

- 第二十五轮从已提交检查点 `68d2abb` 继续，代码/测试/ADR 提交为 `b6e2261`，分支为 `fix/merge-related-match-consistency`。修复 Guided Merge 识别与改写的匹配规则不一致：存在 `Notes/Beta.md` 和 `Archive/Beta.md` 时，discovery 跳过歧义 `[[Beta]]`，但旧 remove helper 在删除明确的 `[[Notes/Beta]]` 时仍连带删掉它；旧 add helper 也会让歧义裸链接抑制应新增的明确关系。
- 共享 Related add/remove 接受可选 matcher；Merge 全部调用使用同一个准备期 resolver。规范化文本相同可去重；不同文本只有都解析到同一 Concept 路径才匹配。survivor/邻居上的歧义链接保持原文和别名，明确关系正常重连；源 Concept 上未解析的限定路径也不会被 survivor 的同名裸链接吞掉。其他调用者保持原默认行为，无 schema/plan 字段/事务协议变更。
- 第二十五轮验证：全量测试、构建、发布检查、diff 检查和限定复审通过。旧实现复现歧义链接丢失；仅修复删除后又独立复现新增明确关系被抑制。五个真实 prepare → execute 场景覆盖 survivor/reader 上误删、添加 survivor/neighbor/未解析来源关系及无关同名文件零改动，既有唯一裸链接重连测试继续通过。日志 `/private/tmp/mneme-related-consistency-all.log`、`/private/tmp/mneme-related-consistency-focused.log`、`/private/tmp/mneme-related-consistency-remove-red.log`、`/private/tmp/mneme-related-consistency-add-red.log`。规则见 [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md)。
- **下一轮明确修复项**：`RelatedConceptService` 和 `ConceptDeletionService` 仍直接使用无上下文的默认 basename matcher；手动添加/移除及删除清理可能误操作指向另一同名文件的裸链接。前者 adapter 虽可用 ObsidianVaultAdapter 的 resolver，但 main 创建时未传 metadataCache；后者独立 adapter 尚无 resolver。需要把源文件路径与解析结果接入这些流程，并明确解析不可用/歧义及预览后目标变化时的阻止策略。不要把本轮 Merge 内部一致性当作完整 Obsidian Wiki 解析。根目录优先、大小写、扫描后外部变更、多个 Related 章节、真实 Obsidian 验收及 Merge 持久化恢复仍待完成。

- 第二十四轮从已提交检查点 `385df15` 继续，代码/测试/ADR 提交为 `ce9c8d0`，分支为 `fix/related-explicit-paths`。修复带目录的 Related 链接无法精确匹配时退回文件名的问题：`Missing/Beta` 不再被 Guided Merge 当成 `Notes/Beta.md`，避免重连无关笔记、删除 survivor 的原有链接或引入其他目录的同名邻居。
- 共享 Related matcher 改为单向简写匹配：只有正文链接本身不带目录时才允许按文件名匹配。删除/替换根目录 `Beta.md` 不再误删 `Archive/Beta`，添加根目录关系也不会被该链接错误去重。带目录路径要求规范化后精确一致；未解析链接保留原文。裸链接继续沿用既有兼容规则，Merge 的 basename lookup 仍要求唯一。
- 第二十四轮验证：全量测试、构建、发布检查、diff 检查通过。旧 Merge 复现未知目录链接被计作 1 个重连邻居（预期 0）；仅替换旧 helper 的删除 bundle 复现删除根目录 First 时计划删除 `Archive/First`。回归覆盖未知/精确/裸路径、混合真实与未知关系、survivor 自链接误删、源关系错误迁移，以及根目录删除清理/添加/替换。日志 `/private/tmp/mneme-related-paths-all.log`、`/private/tmp/mneme-related-paths-focused.log`、`/private/tmp/mneme-related-paths-red.log`、`/private/tmp/mneme-related-root-delete-red.log`。
- 规则见 [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md)。本轮不改 schema 或事务协议。**后续边界**：裸链接歧义、相对路径和大小写冲突、Obsidian 源文件上下文解析、多个 Related 章节及其他 section helpers；真实 Obsidian 验收、源 Concept 自定义 YAML/redirect 保留与 Merge 持久化恢复仍待完成。

- 第二十三轮从已提交检查点 `da1028b` 继续，代码/测试/ADR 提交为 `2d9b958`，分支为 `fix/related-markdown-literals`。修复 Related Concepts 把短围栏后的代码示例、HTML 注释、单行 inline code 和 escaped Wiki 文本当成真实关系的问题；原行为会误识别邻居，并在 Merge/关系移除时改写示例。
- 将正文检查从 Merge 专用模块提取为 `markdownLineInspector.ts`，Related 章节查找/读取/删除使用同一份 active ranges；代码/注释/转义按等长空格屏蔽，仅对与原文完全一致的真实链接范围逆序删除。保留 frontmatter、示例、无关正文及非目标章节；含注释或示例的章节不会按空白删除。添加关系不会把示例当成重复；若追加位置落在未闭合 fence/comment 内则报错并要求先闭合，较早的独立已闭合 Related 章节仍可编辑。
- 第二十三轮验证：全量测试、构建、发布检查、diff 检查通过。旧 helper 复现示例被解析为 Beta；单独替换旧 helper 的真实 Merge bundle 又复现仅含示例的笔记被计作 1 个待重连邻居（预期 0）。新回归覆盖 LF/CRLF、短/带尾随文本的围栏、伪章节/伪结束标题、行内注释与 code、转义/缩进示例、同一行多个真实/示例链接、Unicode offset，以及真实 Merge 对示例邻居零改写、真实邻居重连后示例不变、未闭合内容阻止时文件/状态零写入。日志 `/private/tmp/mneme-related-literals-all.log`、`/private/tmp/mneme-related-literals-focused.log`、`/private/tmp/mneme-related-literals-red.log`、`/private/tmp/mneme-related-merge-red.log`。
- 规则见 [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md)。本轮覆盖共享 Related helpers 的调用者，包括手工关系、Merge、删除清理；不改持久 schema、路径匹配策略或事务/恢复协议。**后续边界**：继续审查 Related 的路径解析歧义、多个同名章节，以及其他 section helpers；Setext/复杂容器/HTML/跨行 code span 不是本轮完整支持的 Markdown 语义。真实 Obsidian、源 Concept 自定义 YAML/redirect 保留与 Merge 持久化恢复仍待完成。

- 第二十二轮从已提交检查点 `fd968fd` 继续，代码/测试/ADR 提交为 `4b0fac4`，分支为 `fix/merge-concept-structure`。修复 Concept perspective 提取删除全部 H1 的问题：仅省略正文第一个非空行上的文档 H1 标题；额外 H1 和前言后的 H1 保留。存在额外 H1 时整体下移三级，否则维持原来的两级，使 ATX 标题留在生成的 H3 View 内；超过 Markdown H6 的层级仍按既有上限处理。
- 提取 `conceptMergeMarkdown.ts` 共用正文结构检查、路径比较和模板导航处理。survivor 采用源 Card Group 时同时更新 frontmatter 与原正文 Review Cards 导航，匹配旧声明路径才更新，保留原显示别名/空白/换行；同一匹配器用于移除历史 View 中的模板导航。跳过其他章节、子章节、其他目标/锚点、代码与注释，不创建原本不存在的导航区。
- 第二十二轮验证：全量测试通过；最后注释/缩进调整后 Concept 专项、构建、发布检查和 diff 检查再次通过。旧版分别复现额外 H1 丢失和 adopted group 的正文导航未更新。覆盖真实 renderManualConcept → prepare → applyConceptMergeDraft → execute、LF/CRLF、别名保留、前言/无标题/额外标题、围栏/注释/缩进保护及代码中的 comment 示例。日志 `/private/tmp/mneme-concept-structure-all.log`、`/private/tmp/mneme-concept-structure-focused.log`、`/private/tmp/mneme-concept-structure-red.log`、`/private/tmp/mneme-concept-navigation-red.log`。Card 内容、ID、复习状态和持久 schema/事务协议未改。
- **后续边界**：真实 Obsidian 中核对额外章节的渲染层级，以及采用源 group 后原生 Review Cards 链接的点击目标。其他 section parsers 的围栏/注释处理、Setext/复杂容器、源 Concept 自定义 YAML/redirect 保留策略和 Merge 持久化恢复仍待独立审查。当前模块是有限的 ATX/fence/comment 处理，不是完整 Markdown 解析；它之前的 Related 去重/移除仍由既有 parser 负责。

- 第二十一轮从已提交检查点 `436bfa1` 继续，代码/测试/ADR 提交为 `7261d28`，分支为 `fix/concept-perspective-references`。补上 Guided Merge 保留原 Concept 为 View 时的引用检查：抽出共用 `markdownRelocationSafety.ts`，Card 保持原规则；Concept perspective 在去除确定性 Related 导航后，比较源 Concept 和目标文件的引用上下文。预览前和执行前均检查，后者使用最终编辑后的 Markdown，覆盖新增引用定义改变原 literal label 的情况。
- 模板 `## Review Cards` 直属的 `Cards: [[...]]` 若精确匹配源 frontmatter 声明的 Card Group，不再复制到历史 View，避免尚未创建 Card Group 的正常 Concept 被新 guard 误拦截。保留同章节用户笔记、其他位置的链接和 fenced 示例。提取正文时跟踪围栏字符/长度，仅匹配足够长且无尾随文本的闭合行，防止短围栏或另一种围栏使代码中的标题/导航被改写。
- 第二十一轮验证：全量测试、构建、发布检查、diff 检查通过；最后补强围栏反例后专项和构建再次通过。旧服务分别复现相对图片返回 ready，以及代码围栏内文本被改写。覆盖 LF/CRLF、相对附件/anchors/reference/footnote/HTML、稳定 Wiki/外部链接、空 Card Group 导航、原文保留、执行前 Wiki 变化与最终草稿引入定义，阻止时文件/状态零写入。日志 `/private/tmp/mneme-concept-perspective-all.log`、`/private/tmp/mneme-concept-perspective-focused.log`、`/private/tmp/mneme-concept-perspective-red.log`、`/private/tmp/mneme-concept-perspective-fence-red.log`。本轮仅在内存 plan 增加 preserve 标记，无持久 schema/事务协议变化。
- **下一轮审查线索**：继续复现 Concept 正文结构保留边界，包括额外 H1 被当作标题删除、其他 section parsers 对围栏长度的处理，以及 survivor 采用另一 Card Group 时原正文 Review Cards 导航是否同步。源 Concept 的自定义 YAML/redirect 保留策略也仍需独立审查。真实 Obsidian 附件/缓存/渲染验收、Incoming/Guided Merge 持久化恢复仍待完成；本轮保守语法检查不等于完整 Markdown 语义迁移。

- 第二十轮从已提交检查点 `8d6b0d6` 继续，代码/测试/ADR 提交为 `1c3c23c`，分支为 `fix/card-relocation-references`。确认 Review 用 Card 当前文件路径渲染，因此原样搬移 Card blocks 仍会改变相对附件、同文件锚点和文档引用定义的含义。提取 `cardRelocationSafety.ts`：预览前拒绝已知依赖，报告 Card ID/源路径/目标路径；Wiki links/embeds 通过 Obsidian metadata cache 比较两处解析目标，仅放行相同且非源 group 的已解析文件。常见绝对外部 URL 允许；直接采用源 group、不改变路径时不做搬迁拦截。
- 执行前在原有文件/状态快照校验后再次检查，覆盖预览后其他文件改变 Wiki 解析的情况。相对 Markdown links/images、同文件 Wiki anchors、引用/脚注/定义、源或目标存在定义的 shortcut、HTML href/src/srcset 会保守阻止；代码示例也可能被阻止。不改 Card raw bytes、ID、Review 状态或持久 schema。
- 第二十轮验证：全量测试、构建、发布检查、diff 检查通过并完成复审。旧服务 bundle 对 `![image](./asset.png)` 仍返回 ready，回归要求 blocked；验证阻止时全部文件/状态零写入、稳定 Wiki 和外部链接成功、原组采用、缺少 resolver、预览后解析变化等。日志 `/private/tmp/mneme-card-relocation-all.log`、`/private/tmp/mneme-card-relocation-focused.log`、`/private/tmp/mneme-card-relocation-red.log`。行为与边界见 [ADR 0003](adr/0003-concept-merge-requires-guided-review.md)。
- **后续边界**：真实 Obsidian 中验收附件/Wiki cache/Review 渲染仍待执行。当前是保守词法预检，不是完整 Markdown 解析或自动链接迁移；外部 backlinks、第三方 embed/query、heading/block ID 冲突和检查后的外部并发编辑仍需独立审查。Incoming/Guided Merge 的持久化恢复、进程终止及回滚冲突恢复尚未新增。

- 第十九轮从已提交检查点 `b8656b4` 继续，代码/测试/ADR 提交为 `5909142`，分支为 `fix/merge-card-group-content`。修复 Guided Merge 对源 Card Group 整文件生成 redirect，丢弃自定义 YAML 和 Card 块之外笔记的问题。现在按原始 offset 逆序移除完整 Card blocks，原文件保留块外正文/自定义属性，仅更新 Mneme 类型、owner、Concept/redirect 链接并附导航说明；Card blocks 原样搬到目标，块外笔记留在原路径。
- 同轮补上每个 Card Group 内部的 Card ID 唯一性检查，原先仅比较两组间交集。source/target/直接采用源组三种情况都拒绝组内重复。块外残留 FRONT/BACK/RUBRIC 标记也会阻止 Merge，避免搬走完整块后产生假 Card；代码块中的标记示例同样会被保守阻止。源文件类型规范化为 plain card_group，使原 quoted key 的非空组搬空后仍被识别为空组。
- 第十九轮验证：全量测试、构建、发布检查、diff 检查与复审通过。旧实现丢失 custom_property，保留修复后再独立复现组内重复仍返回 ready。回归覆盖 LF/CRLF × 零/一/多块、YAML 自定义列表、正文/callout/注释/引用保留、Card raw bytes 与 IDs 保留、空 redirect 解析、组内重复、旧式块外 markers、quoted type。日志 `/private/tmp/mneme-merge-card-content-all.log`、`/private/tmp/mneme-merge-card-content-focused.log`、`/private/tmp/mneme-merge-card-content-red.log`、`/private/tmp/mneme-merge-card-duplicate-red.log`。规则见 [ADR 0003](adr/0003-concept-merge-requires-guided-review.md)。
- **后续边界**：真实 Obsidian 中给源 Card Group 添加自定义属性、卡前/卡间/卡后笔记后合并，核对原文件保留这些内容、目标仅有一份 Card、Review 无重复；加入组内重复 ID 应零写入。块外笔记不会自动搬到目标文件，路径相关的 Markdown 引用与 Merge 自身持久化恢复仍可继续审查。进程终止/回滚冲突的恢复协议仍未新增，不应把本轮内容保留解释为跨进程事务保证。

- 第十八轮从已提交检查点 `83c729f` 继续，代码/测试/ADR 提交为 `d93c26f`，分支为 `fix/merge-pending-write-guards`。修复 Merge 与其他待恢复写入的交叉冲突：Manual Card/Concept 或 Inbox 已写 Markdown、完成保存失败后，Guided Merge 原本仍能移动 Card/改正文，使原 receipt 路径、owner 或哈希失效；Incoming 的 Inbox origin 也能改写另一个 pending Manual Concept 或 Inbox update 的目标。
- 提取 `mergePendingWrites.ts`。Guided 在返回预览前核对两个 Concept IDs、全部计划路径（含 Related 邻居）、两边声明的 Card Group 路径，保护尚未创建的 group；Incoming 仅核对实际 Concept 目标路径，同 Concept 的独立 pending Manual Card 不受影响。完成及无关有效 receipts 放行；坏的待恢复记录不静默忽略。预览后出现的 receipt 由原有状态快照校验阻止执行，不增加持久字段或新事务协议。
- 第十八轮验证：全量测试、构建、发布检查、diff 检查和复审通过。新增真实 Manual Card/Manual Concept/ApprovedProposalWriter 故障回归：Card 写前与完成保存失败、Concept 完成保存失败、survivor/Related 邻居的 Inbox update 完成保存失败，断言阻止 Merge 时完整文件/状态不变；随后 Resume 不重写已完成 Markdown，再次 Merge 可用，Card ID 保留一次。还覆盖无关 pending、完成 receipts、路径规范化、Inbox origin 的目标保护及 receipt 在预览后出现。两个旧服务 bundle 均复现 ready 而应 blocked。日志 `/private/tmp/mneme-merge-pending-all.log`、`/private/tmp/mneme-merge-pending-conceptMergeService-red.log`、`/private/tmp/mneme-merge-pending-incomingConceptMergeService-red.log`。
- **下一轮重点**：继续设计/审查 Merge 本身的持久化 intent 和完成协调。进程终止、提交与补偿均失败、回滚冲突后部分状态仍未自动恢复，本轮只保护已有创建/Inbox 恢复协议。真实 Obsidian 待验收：在测试 Vault 注入创建完成保存失败，尝试涉及该文件的 Merge 应要求先恢复；恢复后再合并，确保 Card/Concept 不重复、Related 邻居内容完整。同进程队列不提供外部进程互斥；其他操作与待恢复写入的交叉保护仍需另行审查。

- 第十七轮从已提交检查点 `bb69ace` 继续，代码/测试/ADR 提交为 `6a61b59`，分支为 `fix/merge-input-ownership`。审查 Merge 持久化入口时先修复三个前置校验缺口：Guided Merge 使用缓存 cardsPath 可能覆盖扫描后已改变的 Card Group 链接；Incoming Merge 接受已有 writeReceipt 的 approved 提案；Incoming 用全文正则查 ID，正文/code fence 的旧 ID 也能使错误目标通过检查。
- Guided 现在用与 scanner 相同的路径解释比较当前 frontmatter 和 summary，链接更改/新增/删除须刷新后重建；Incoming 拒绝任何非 undefined receipt（含坏记录），保留原写入恢复流程。提案在预览后新增 receipt 仍被原有状态快照检查阻止。身份只接受顶部 frontmatter 的唯一 Concept 类型/ID；抽出 ID 修复原有 scalar reader 供 Merge 共用，支持单/双引号、注释、LF/CRLF及重复字段拒绝。Guided setter 同步识别 quoted key，避免新增重复 cards 字段。
- 第十七轮验证：全量测试、构建、发布检查、diff 检查及复审通过。旧版对照分别复现 changed Card link、pending receipt 和正文旧 ID 均错误返回 ready；身份对照仅恢复旧谓词以隔离缺陷。测试覆盖两侧链接变化、正常别名/省略.md/quoted keys、有效/坏 receipt × 原目标存在与否、完整文件/提案/草稿/Source 状态保留和预览后 receipt 竞争。临时日志 `/private/tmp/mneme-merge-input-all.log`、`/private/tmp/mneme-merge-input-focused.log`、`/private/tmp/mneme-merge-input-{cards,receipt,identity}-red.log`。规则见 [ADR 0003](adr/0003-concept-merge-requires-guided-review.md) 和 [ADR 0021](adr/0021-name-conflict-merge-defers-all-writes.md)。
- **下一轮重点**：Incoming/Guided Merge 的持久化 intent/完成协调仍待设计；进程终止、提交与补偿均失败、回滚冲突的部分状态仍不自动恢复。本轮没有改变状态格式或事务协议。真实 Obsidian 待验收：选择 Merge 后外部改变 cards 链接，确认旧选择被阻止；延迟冲突选择期间另一窗口产生写入恢复记录，确认不能转入 Merge 完成；修改目标类型或 ID 并在正文保留旧 ID，确认零写入。完整 YAML 解析、扫描后外部新增重复 ID 和跨进程互斥不由本轮保证。

- 第十六轮从已提交检查点 `292e6fc` 继续，代码/测试/ADR 提交为 `223494d`，分支为 `fix/markdown-transaction-uncertain-writes`。修复 P1：共享 Markdown 事务原本在 `await vault.process()` 成功后才登记回滚，若文件已写入后才 reject，报错文件会被遗漏。现在在 transform 内通过 `before` 核对后立即登记，失败时逆序补偿；当前为 `after` 则恢复，为 `before` 则保持，其余内容保留并报告冲突。预检失败不登记，避免撤销其他写入者恰好等于预期结果的内容。
- 影响 Incoming/Guided Merge、Related 更新及 Source provenance 重连/移除；数据格式和状态提交顺序不变。测试覆盖 transform 前、transform 后但未应用、应用后报错，以及回滚竞争、状态提交失败、无变化写入；两类 Merge 用真实 service fixture 核对完整 Markdown/plugin data 和零 state commit。规则补充在 [ADR 0022](adr/0022-plugin-state-mutations-share-one-queue.md)。
- 第十六轮验证：全量测试、构建、发布检查、diff 检查及复审通过。旧实现回归明确复现第二文件保留 `after` 未恢复 `before`。临时日志 `/private/tmp/mneme-markdown-uncertain-writes-all.log`、`/private/tmp/mneme-markdown-uncertain-writes-focused.log`、`/private/tmp/mneme-markdown-transaction-red.log`。
- **下一轮重点**：继续审查 Incoming/Guided Merge 的持久化恢复，尤其是进程终止、状态提交与补偿均失败、回滚遇到用户编辑时留下的部分状态。本轮只修复同进程不确定写入，不提供 journal 或重启恢复。真实 Obsidian 待验收：在一次性测试 Vault 的 adapter 中注入写入生效后报错，确认文件与提案/草稿/来源状态恢复；再插入用户编辑，确认正文保留并显示回滚冲突。不要把直接终止进程当作本轮已覆盖场景。

- 第十五轮从已提交检查点 `8c0a112` 继续，代码/ADR 提交为 `72edadb`，分支为 `fix/guided-merge-session-lifecycle`。修复普通 Guided Merge 的同类生命周期问题：关闭/换选择后旧确认仍能执行、旧 AI/shortlist inspection/扫描结果影响新选择、确认期间操作锁提前释放、提交完成后覆盖新 UI。operation revision 隔离扫描/AI/确认和编辑回调；AI 提前捕获 survivor；执行显式接收 plan/final Markdown，移除 View 上可变化的预览字段。
- 锁覆盖准备→确认→提交，控件和回调均检查状态。刷新/换选择等待已开始的 commit；关闭立即使 UI 回调失效并等待 commit，不撤销已确认写入。完成后清除内存草稿，旧控件不能重复提交。普通刷新丢失已选 Concept 时仍保留手写正文，缺失目标不能合并。无新持久字段，规则补充在 [ADR 0003](adr/0003-concept-merge-requires-guided-review.md)。
- 第十五轮验证：全量测试、构建、发布检查及 diff 检查通过；最终小调整后 writer 专项和构建也通过。旧版 bundle 复现关闭后旧确认执行。回归覆盖关闭/换对/同对重开/刷新、重复确认、AI/inspection迟到、乱序扫描、read/prepare/scan时关闭、提交中close/setSelection/refresh等待、完成防重提及刷新丢失选择时草稿保留。临时日志 `/private/tmp/mneme-guided-merge-lifecycle-all.log`、`/private/tmp/mneme-guided-merge-lifecycle-focused.log`、`/private/tmp/mneme-guided-merge-lifecycle-red.log`。
- **下一轮重点**：IncomingConceptMergeService 和 ConceptMergeService 的最终状态保存/回滚及跨进程中断恢复。本轮没有改变底层多文件 Markdown/状态事务；不要把 View 关闭保护解释为持久化恢复。真实 Obsidian 待验收：确认框打开后重开另一对或关闭 View，旧确认不得写；AI等待期间从另一入口换选择；提交中关闭/换对须等待并刷新正确结果。

- 第十四轮从已提交检查点 `57bdc2f` 继续，代码/ADR 提交为 `15ad40c`，分支为 `fix/conflict-merge-session-lifecycle`。修复 Conflict Merge 的异步会话隔离：旧确认在切换后仍执行、旧 AI/草稿加载覆盖新上下文、旧 finally 解锁新请求、完成回调读取可变化 session 等。每次激活递增 revision；异步结果检查 session+revision+closed，确认流程从准备到提交保持锁定，执行显式接收原 plan/session。
- 关闭立即使旧 UI 回调失效；已经开始的 commit 完成后才能切换/结束关闭，成功回调仍拿到原 session，关闭后不重绘。编辑控件和旧事件回调受工作状态/会话保护。切换前保存失败保留内存编辑；completed 草稿不再保存复活。草稿清理由 IncomingConceptMergeService 的最终状态提交负责，View 不另行清表。
- 第十四轮验证：全量测试、构建、发布检查及 diff 检查通过。旧版 bundle 复现切换后旧确认执行 1 次、期望 0 次。测试使用真实 View 方法/确认函数、持久存储克隆和 Promise 屏障，覆盖不同 key/同 key/同对象重开、重复确认、AI交错、加载乱序、关闭期间 read/response/prepare/confirm、提交等待、原会话回调、零迟到重绘及保存失败保留。临时日志 `/private/tmp/mneme-conflict-merge-lifecycle-all.log`、`/private/tmp/mneme-conflict-merge-lifecycle-red.log`。
- **下一轮建议**：审查普通 Guided Merge View 是否存在相同生命周期问题，以及 Incoming/Guided Merge 的最终状态保存与跨进程中断恢复。本轮没有改变底层 Markdown/状态事务协议，也不代表真实 Obsidian popout/dialog/restart 验收完成；在测试 Vault 中应补“确认框未关闭时重开同一 Merge、AI等待时关闭、提交中切换”的手工验收。规则补充在 [ADR 0021](adr/0021-name-conflict-merge-defers-all-writes.md)。

- 第十三轮从已提交检查点 `25cf41c` 继续，代码/ADR 提交为 `f8a9c05`，分支为 `fix/proposal-target-after-id-repair`。修复 P1：重复 Concept ID 修复后，旧 ID 只剩另一 Concept 使用，旧 Proposal 可能因此写入错误目标。无 write receipt 的 update/add_view/link 提案遇到 completed duplicate repair 的旧 ID 时保留正文并阻止写入；new_card 仅在生成时的 Source path 与唯一扫描 Concept 匹配、且不是已修复文件路径时放行。已有有效 receipt 继续按原路径/哈希恢复；不全局迁移旧 ID。
- 同轮修复 P2：Conflict Merge 在 existingConceptId 或 incomingFingerprint 改变时，原先自动清空存储草稿并用默认内容覆盖。现在完整恢复手写字段，提示上下文变化、需逐项核对；当前选择的 Concept 和现有预览/确认流程仍决定最终写入。数据格式不变，见 [ADR 0029 补充](adr/0029-concept-id-repair-resumes-both-markdown-files.md)。
- 第十三轮验证：全量测试、构建、发布检查及 diff 检查通过，最终补强的 writer 专项也通过。旧版 bundle 对照分别复现错误 written 和手写草稿被默认字段替换。测试覆盖三种 Concept 提案、Card 路径缺失/错配/陈旧扫描/无扫描、正常路径、不相关 repair、完成保存失败后重建恢复且零重复写入，以及真实 setSession 的四种草稿上下文组合。临时日志 `/private/tmp/mneme-proposal-target-repair-all.log`、`/private/tmp/mneme-approvedWriteRecovery-red.log`、`/private/tmp/mneme-conceptConflictMergeDraftRestore-red.log`。
- **后续重点**：审查 Conflict Merge 确认对话框等待期间的关闭/切换/异步回调，以及 Merge 最终状态保存的中断恢复。当前歧义旧 Proposal 没有显式重绑定入口，重新打开本身不能解除阻止；Card 可从正确 Concept 重新生成。真实 Obsidian 验收仍待完成：尝试接受修复前的旧提案，确认错误目标不变且提案正文保留；改动 Concept ID 或 incoming 内容后重开 Merge，确认手写草稿与警告可见。

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
- 当前审查/重构分支：`test/native-merge-acceptance`；第一轮代码提交为 `04bc46f`、`4e16141`、`95cf030`，文档检查点为 `0377c60`；第二轮代码提交为 `37d3533`，文档检查点为 `30bcce7`；第三轮代码提交为 `3100b9b`、`5617b23`，文档检查点为 `4e57766`；第四轮代码/ADR 提交为 `f2dbec4`，文档检查点为 `59ddfd2`；第五轮从该已提交检查点继续，代码/ADR 提交为 `ecd462c`，文档检查点为 `d125577`；第六轮代码提交为 `f66bd16`（索引同步）和 `3a9f321`（删除校验），之后另有本交接/审查文档提交。
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

注意：当前版本 1.0.0，审查重构分支为 `test/native-merge-recovery`，审查前备份提交为 `83deb3f`；最新提交请以 git log 为准。请先读 docs/CODE_REVIEW_2026-09-05.md 的已修复与未修复事项。另有长期存在的未跟踪 `mneme` 自链接和 `release-artifacts/`。先只读检查 git status，保留所有现有修改、验收 Vault 与录像。

v1.0 功能已经完成。产品定位已调整为面向自我导向终生学习者的个人知识记忆插件，核心闭环是 Source Note → Concept → Card → Review → Concept Library。

Course Context、Exam Mode、Use Mode、AI Answer Grading、Project Discovery 和内置学习 Agent 已退出产品路线。普通复习不得调用 AI；AI 仅用于用户明确触发、边界清楚的 Concept/Card 提取或草拟。Knowledge Context Pack 和 Anki TSV 只是导出工具，不是独立 Mode。

最近完成的是自行验收与录像交付。两段 720p 录像位于 release-artifacts/，分别为 mneme-1.0-recorded-acceptance-720p.m4v 和 mneme-1.0-conflict-rollback-720p.m4v。录制使用 Mock provider：核心写入/复习流程与冲突返回通过，不代表真实模型的中英文语义质量通过。

录制 Vault 是 release-artifacts/Mneme_Recorded_Acceptance，仍保留 1 个待审 Proposal、1 个合并草稿、1 次 Good 复习；没有产生 -2 Concept。手动测试指南和中英文/长文本/边界样本在 release-artifacts/Mneme_Release_Candidate/Manual Acceptance/。不要误操作我的其他 Vault。

请先核对当前状态和我对录像的反馈，再继续明确的缺陷修复或剩余验收。重点剩余项是真实 provider 内容质量、完整重启回归矩阵及 Windows 验收。不要把旧清单的全部条目自动勾选，不要直接扩展功能或发布。

所有固定 UI 标签使用英文。FSRS 继续完全控制 Card 调度；只有正常 Card Review 中由用户确认的 Again/Hard/Good/Easy 可以更新 FSRS。
```
