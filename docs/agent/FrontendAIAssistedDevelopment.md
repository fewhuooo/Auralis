# 前端 AI 辅助开发约定

更新时间：2026-08-17

文档状态：现行

权威范围：`Auralis-PC`、`Auralis-Mobile` 的 AI 辅助实现、审查、验证和交接方式

事实来源：`AGENTS.md`、前端模块/设计文档、当前工作树与 Google Antigravity 官方资料

## 使用决策

前端实现默认优先使用 AGY/Antigravity 中当时可用的 Gemini 模型完成代码草拟、组件实现、样式调整、局部重构和前端问题修复。这里的“优先使用”是开发协作偏好，不是运行时依赖，也不替代人工或其他 Agent 的代码审查。

适用范围：

- `Auralis-PC/src/`、`Auralis-PC/src-tauri/` 中与前端交互直接相关的代码。
- `Auralis-Mobile/src/`、`Auralis-Mobile/scripts/` 中的手机、微信小程序和 Tablet 前端代码。
- 前端专属的样式、组件、页面、Store、端侧服务和前端自动检查。

不因使用 Gemini 而扩大范围：后端 Controller/Service、数据库迁移、API/数据库契约、鉴权边界、生产配置、密钥和部署拓扑仍按原有模块规则处理。生成的 API 类型文件继续禁止手改。

## 工具与当前可用性

Google 的 Antigravity 文档说明，Agent 可以在编辑器、终端和浏览器之间工作；IDE 支持选择模型、查看代码变更、计划、任务清单和 walkthrough，浏览器能力可用于 UI 迭代与检查。Antigravity 的模型列表会随版本、套餐和服务端状态变化，因此本仓库不固定某个 Gemini 版本；执行任务时选择当前可用且适合任务的 Gemini 模型即可。

当前 Codex 工作区没有可直接调用 AGY/Antigravity 或 Gemini 的模型入口。因此，在本工作区实际完成的任务中，只有确实使用了用户提供的 AGY/Gemini 产物或可核实的外部执行记录，才能写成“由 Gemini 实现”；否则只能写成“已按 Gemini 审查约定执行”，不得虚构模型使用证据。

### Codex 沙箱与宿主机 AGY

Codex 沙箱和 Windows 宿主机的 `cmd` 不是同一个进程环境。宿主机 `cmd` 能找到 `agy`，不代表沙箱内的 `PATH` 能找到它；也不建议为了绕过隔离把 AGY、登录状态或凭据复制到仓库目录。Codex 的本地/沙箱执行仍应遵循当前会话的目录访问、网络和命令审批边界。

当前机器的实际检查证据（2026-08-17）：

```text
cmd.exe /c where agy
→ C:\Users\Gnasche\AppData\Local\agy\bin\agy.exe

cmd.exe /c agy --version
→ 1.1.13
```

在 Codex 中需要调用宿主机 AGY 时，使用一次一审的沙箱外命令审批；不要把该命令伪装成普通沙箱命令，也不要使用 AGY 的 `--dangerously-skip-permissions`。可先检查并规划，再执行已审查的前端任务：

```cmd
cmd.exe /c agy --help
cmd.exe /c agy models
cmd.exe /c agy --print --mode plan --add-dir D:\CodeBase\Active\Auralis "先阅读项目现行规则，只输出前端任务计划、影响文件和验证命令，不修改文件。"
cmd.exe /c agy --print --add-dir D:\CodeBase\Active\Auralis "按已确认的计划实现前端任务；只修改授权目录，完成后输出 diff 摘要和验证结果。"
```

如果 `agy` 仍不在被批准的宿主机 `PATH` 中，可使用 `where agy` 返回的绝对路径调用；绝对路径只作为本机操作示例，不得写入前端代码、环境变量提交内容或项目契约。AGY 产生的 diff 仍必须回到 Codex/人工审查，再运行项目自己的类型检查、构建、GUI 和真机验收。

## 推荐工作流

1. **先限定上下文**：读取 `AGENTS.md`、`docs/agent/BeforeCoding.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`，再读取对应的 PC 或 Mobile/Tablet 模块文档、`docs/design/Frontend.md` 和涉及的契约文档。先运行 `git status --short`，保护用户已有修改。
2. **先让 Gemini 计划，再让它改动**：在 AGY 中使用 Review-driven development；先要求输出目标、拟修改文件、依赖和验证命令，确认范围后再接受变更。每次尽量保持一个页面、组件、Store 或一个明确问题为最小变更单元。
3. **使用项目上下文**：将相关现行文档和源码作为上下文提供给模型，不提供 `.env`、token、refresh token、真实用户数据、生产日志或其他敏感信息。模型不得依据 `docs/archive/`、`docs/showcase/` 或旧 StudyCore 命名恢复实现。
4. **保留可审查的差异**：不直接接受“全部变更”；先查看 diff、生成文件、依赖变化、删除操作和跨模块写入，再接受或要求 Gemini 修正。必要时让 Gemini 生成 walkthrough，但 walkthrough 仍属于辅助证据。
5. **先做静态审查，再做命令验证**：审查通过后只运行与改动相关的类型检查、静态契约检查和构建命令；记录实际命令、退出码、警告和未覆盖范围。
6. **最后做人工验收**：涉及视觉、布局、动画、触控、Tauri、微信开发者工具、浏览器或真实 AI 流式消费时，单独记录 GUI、真机或外部服务结果。构建通过不等于交互验收通过。

## Gemini 代码审查清单

### 范围与结构

- 是否只修改用户授权的前端目录和相关现行文档？是否误改后端、生成 SDK、锁文件或无关配置？
- 是否遵循当前路由、页面、Store、服务和条件编译边界？是否新增了已有职责的重复 Store/API/组件？
- 是否引用当前代码和现行文档，而不是归档页面、旧路由或 StudyCore 命名？

### 契约、状态与安全

- 是否继续使用现有请求封装、Authorization、refresh 和错误处理？是否硬编码新的 Server 地址、token 逻辑或 WebSocket 地址？
- 是否保持 `userId` 隔离、软删除、版本/cursor、离线 mutation 和同步状态语义？
- 是否把 loading、empty、error、offline、saving、synced、401/refresh 失败等状态明确呈现，而不是吞掉错误？
- 是否把 API 输出、AI 生成内容、用户输入和本地持久化正确区分？是否把敏感信息、密钥或真实用户数据带入前端日志或模型上下文？

### 视觉、平台与可访问性

- 是否符合 `docs/design/Frontend.md` 的 Zen Minimalist 令牌、响应式布局、动效时序和暗色模式边界？
- PC 是否覆盖键盘、鼠标、窄栏、Tauri 权限边界；Mobile/Tablet 是否覆盖安全区、输入法、弱网、触控和微信条件编译？
- Tablet 手写入口是否仍受 feature flag 控制，未被模型根据历史页面自动恢复？
- 图标按钮是否有可读标签，颜色是否不是唯一状态信号，拖拽/hover 是否有替代操作，减少动态效果设置是否得到尊重？

### 维护性与验证

- 是否引入新的依赖、动态 import、Sass 或 TypeScript 警告？若有，是否解释影响并记录？
- 生成的 `api/generated/` 文件是否由脚本生成而非手改？OpenAPI drift 检查是否仍能通过？
- 是否为行为变化补充或更新静态检查/自动测试？没有运行的测试不得写成通过。
- 是否分别写明“代码存在”“审查通过”“命令验证”“GUI/真机验收”和“外部服务验收”？

## 提示词模板

在 AGY 中执行前端任务时，建议把以下约束放在任务提示词开头，再补充具体需求：

```text
你是 Auralis 前端实现代理。先阅读并遵守 @AGENTS.md、
@docs/agent/BeforeCoding.md、@docs/current/Status.md、
@docs/current/IssuesAndReview.md，以及本任务对应的前端模块和设计文档。

仅修改明确授权的前端目录。先输出计划、影响文件和验证命令，等待确认后再改动。
不得依据 docs/archive、docs/showcase 或 StudyCore 历史内容恢复实现；不得手改
api/generated；不得硬编码新的鉴权、Server 地址、密钥或用户隔离逻辑。
实现后先展示 diff，再按审查清单自审，最后只运行与改动相关的验证命令，并列出
警告、未验证的 GUI/真机/外部服务边界。
```

## 交接记录

涉及前端代码的任务，在最终交接中增加以下信息：

- AI 辅助：是否实际使用 AGY/Gemini；若未使用，写明“当前环境无可用入口”或实际原因。
- 审查范围：审查过的文件、契约、平台边界和高风险点。
- 验证命令：实际执行的完整命令、退出码、关键输出和不证明的内容。
- 人工验收：浏览器/Tauri、微信开发者工具、H5/真机、Tablet 触控或真实 AI 服务是否验证。
- 未关闭风险：回写 `docs/current/Status.md`、`docs/current/IssuesAndReview.md` 或对应模块文档的事项。

## 外部参考

- [Antigravity IDE 概览](https://www.antigravity.google/docs/ide-overview)：编辑器、终端、浏览器 Agent 和前端 UI 迭代能力。
- [Antigravity 模型列表](https://antigravity.google/docs/models)：模型可用性、套餐差异和模型选择入口。
- [Antigravity IDE 入门 Codelab](https://codelabs.developers.google.com/getting-started-agy-ide)：Review-driven development、diff、walkthrough、浏览器检查以及 workspace rules/workflows 的使用方式。
- [Gemini Code Assist 工作方式](https://developers.google.com/gemini-code-assist/docs/works)：模型会使用当前文件及相关本地项目上下文，因此必须控制上下文中的敏感信息并审查生成结果。
- [OpenAI Codex CLI：沙箱和审批模式](https://help.openai.com/en/articles/11096431)：Codex 的沙箱范围、命令审批和本地执行边界。
