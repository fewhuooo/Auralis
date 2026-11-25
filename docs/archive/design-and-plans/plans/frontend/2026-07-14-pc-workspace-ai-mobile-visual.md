# PC 学习页 AI 伴读移动端视觉复刻 Implementation Plan

**Goal:** 让 PC 学习页右侧 AI 伴读完整采用手机端的欢迎态、消息与胶囊输入视觉语言，同时保持现有聊天流程和上下文。

**Architecture:** 仅在 `SubjectWorkspace.vue` 的右侧 AI 区替换展示标记与样式，不改变 `sendChat`、`streamFetch`、模型选择或学科/文件上下文。现有静态检查脚本扩展为 PC AI 视觉契约，防止文字星号、附件或麦克风入口回归。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、原生 SVG、CSS 动画、Node 静态检查、Vite。

## Global Constraints

- 只改 PC `SubjectWorkspace` AI 展示层和其静态检查；不引入 Uni-app 组件、API、Store 或数据结构改动。
- 保留 Enter 发送、模型菜单、清空、自动滚动、流式回复及当前学科/文件上下文。
- 复刻手机端 Sage Green 渐变四芒星、星环、气泡与输入中状态；不显示附件、加号、分隔线或麦克风入口。
- 所有图标按钮必须保留可读的 `title` 与 `aria-label`。
- 构建和静态检查不等同于浏览器/Tauri 视觉验收。

---

### Task 1: 定义 PC AI 视觉静态契约

**Files:**
- Modify: `Auralis-PC/scripts/check-subject-workspace-reconstruction.mjs`

**Interfaces:**
- Consumes: `Auralis-PC/src/views/SubjectWorkspace/index.vue` 的模板和样式文本。
- Produces: `npm.cmd run check:subject-workspace` 对 AI 欢迎态、头像、输入中状态、胶囊输入及无附件/麦克风入口的回归保护。

- [x] **Step 1: 为未实现的视觉元素添加失败断言**

在 `expectations` 中加入下列断言，并以禁止项合并失败列表：

```js
['mobile spark SVG', 'class="ai-spark-svg"'],
['spark ring', 'class="ai-spark-ring"'],
['assistant spark avatar', 'class="assistant-spark-avatar"'],
['typing dots', 'class="ai-typing-dots"'],
['capsule input', 'class="ai-chat-capsule"'],
['send button label', 'aria-label="发送消息"']

const forbidden = [
  ['attachment affordance', 'ai-input-plus'],
  ['microphone affordance', 'mic-btn']
]

const failures = [
  ...expectations.filter(([label, text]) => {
    const found = source.includes(text)
    return label === 'no PDF viewer default' ? found : !found
  }),
  ...forbidden.filter(([, text]) => source.includes(text))
]
```

- [x] **Step 2: 运行静态检查确认失败**

运行：`cd Auralis-PC; npm.cmd run check:subject-workspace`

预期：退出码为 1，输出包含 `mobile spark SVG`、`typing dots` 和 `capsule input`。

- [x] **Step 3: 提交仅包含检查脚本的红灯提交**

```powershell
git add -- Auralis-PC/scripts/check-subject-workspace-reconstruction.mjs
git commit -m "test: define PC AI visual parity"
```

### Task 2: 复刻欢迎态、对话与输入状态

**Files:**
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue:246-328, 662-735, 1415-1793`

**Interfaces:**
- Consumes: `chatMessages: Ref<ChatMsg[]>`、`chatInput: Ref<string>`、`isAiStreaming: Ref<boolean>`、`streamingContent: Ref<string>`、`currentAiMode`、`clearChat()`、`sendChat()`。
- Produces: 使用 `ai-spark-svg`、`ai-spark-ring`、`assistant-spark-avatar`、`ai-typing-dots`、`ai-chat-capsule` 的 PC AI 展示层；不更改聊天请求参数或状态接口。

- [x] **Step 1: 替换模板中的文字星号与输入结构**

将欢迎态中的 `<div class="ai-star-ring">✦</div>` 换为带渐变 `#7D9372 → #9AB08F → #5C7051` 的 SVG，使用下列结构名：

```vue
<div class="ai-spark-wrap" aria-hidden="true">
  <div class="ai-spark-ring"></div>
  <svg class="ai-spark-svg" viewBox="0 0 52 52" fill="none">
    <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z" fill="url(#workspace-ai-spark-gradient)" />
    <defs><linearGradient id="workspace-ai-spark-gradient" x1="4" y1="4" x2="48" y2="48"><stop stop-color="#7D9372" /><stop offset=".5" stop-color="#9AB08F" /><stop offset="1" stop-color="#5C7051" /></linearGradient></defs>
  </svg>
</div>
```

对每个助手消息和流式行使用同形状 SVG 的 `assistant-spark-avatar`；将流式行在 `streamingContent` 为空时渲染三颗 `.ai-typing-dot`，内容到达后显示现有 Markdown 与 `.typing-cursor`。输入区改为：

```vue
<div class="ai-input-wrapper ai-chat-capsule">
  <textarea
    ref="chatInputRef"
    v-model="chatInput"
    class="ai-input"
    placeholder="问问 Auralis AI..."
    rows="1"
    @keydown.enter.exact.prevent="sendChat"
    @input="autoResizeInput"
  ></textarea>
  <button class="ai-send-btn" :class="{ 'is-ready': chatInput.trim() }" :disabled="!chatInput.trim() || isAiStreaming" @click="sendChat" title="发送消息" aria-label="发送消息">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>
  </button>
</div>
```

不得增加附件、加号、分隔线或麦克风元素；不得改动 `sendChat`、`streamFetch` 或 URL 的计算。

- [x] **Step 2: 替换 AI 区样式**

在同一 SFC 的 AI 样式区域实现以下规则：

```css
.ai-spark-wrap { position: relative; width: 60px; height: 60px; display: grid; place-items: center; }
.ai-spark-ring { position: absolute; inset: -8px; border-radius: 50%; background: radial-gradient(circle, rgba(125,147,114,.22), transparent 70%); animation: ai-spark-pulse 3s ease-in-out infinite; }
.ai-spark-svg { width: 52px; height: 52px; filter: drop-shadow(0 4px 12px rgba(125,147,114,.35)); animation: ai-spark-float 4s ease-in-out infinite; }
.assistant-spark-avatar { width: 32px; height: 32px; border: 1px solid var(--border-default); border-radius: 50%; display: grid; place-items: center; background: var(--color-bg-primary); flex: 0 0 auto; }
.ai-chat-capsule { min-height: 48px; border-radius: 999px; padding: 7px 8px 7px 16px; background: var(--color-bg-primary); }
.ai-send-btn.is-ready { background: var(--color-primary-accent); color: #fff; }
.ai-typing-dots { display: flex; gap: 5px; padding: 9px 12px; }
.ai-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: #7D9372; animation: ai-dot-bounce 1.4s ease-in-out infinite both; }
```

添加 `ai-spark-pulse`、`ai-spark-float` 和 `ai-dot-bounce` 三个 keyframe，并为深色主题保留可读边框和背景。预设问题改为可换行的胶囊，不再使用右移 hover 动画。

- [x] **Step 3: 运行静态检查确认通过**

运行：`cd Auralis-PC; npm.cmd run check:subject-workspace`

预期：输出 `Subject workspace reconstruction contract passed.`。

- [x] **Step 4: 构建 PC 前端**

运行：`cd Auralis-PC; npm.cmd run build`

预期：`vue-tsc -b && vite build` 退出码为 0；若有大 bundle 警告，记录但不将其表述为失败。

- [x] **Step 5: 提交视觉实现**

```powershell
git add -- Auralis-PC/src/views/SubjectWorkspace/index.vue Auralis-PC/scripts/check-subject-workspace-reconstruction.mjs
git commit -m "feat: mirror mobile AI companion visuals"
```

### Task 3: 回写现行文档与最终验证

**Files:**
- Modify: `docs/design/Frontend.md:SubjectWorkspace`
- Modify: `docs/modules/FrontendPC.md:页面职责`
- Modify: `docs/current/Status.md:PC Web`
- Modify: `docs/current/IssuesAndReview.md:P2-PC-Workspace-Prototype-Validation`
- Modify: `docs/release/Changelog.md:2026-07-14 PC 学科工作区`

**Interfaces:**
- Consumes: Task 2 的实现范围和实际命令输出。
- Produces: 当前设计、模块边界、命令证据和 GUI 验收风险的同步记录。

- [x] **Step 1: 回写视觉与验收边界**

将文档明确为：PC 右侧 AI 伴读复刻手机端四芒星、星环、气泡、输入中状态与纯文本胶囊输入；未接入附件和麦克风；既有流式接口与上下文保持不变；实际浏览器/Tauri 动画与响应式视觉仍待人工验收。

- [x] **Step 2: 最终执行全部相关校验**

运行：

```powershell
cd Auralis-PC
npm.cmd run check:subject-workspace
npm.cmd run check:subject-icons
npm.cmd run build
cd ..
git diff --check
```

预期：两条静态检查与构建通过，`git diff --check` 无输出。

- [x] **Step 3: 提交文档回写**

```powershell
git add -- docs/design/Frontend.md docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
git commit -m "docs: record PC AI visual parity"
```
