# PC 学科线条图标 Implementation Plan

**Goal:** 新建 PC 学科使用简约线条图标，既有 Emoji 学科不迁移且保持原样显示。

**Architecture:** `Subject.icon` 保持字符串字段。`src/utils/subjectIcon.ts` 仅把受控的语义键解析为 Element Plus 图标组件；其他非空字符串作为历史显示值原样保留。创建弹层只写入语义键，所有可渲染组件的位置复用同一解析器。

**Tech Stack:** Vue 3、TypeScript、Element Plus 2.13.7、`@element-plus/icons-vue` 2.3.2、Node 静态契约检查、Vite。

## Global Constraints

- 只影响 PC 学科图标；不得迁移或批量改写本地数据库中已有 Emoji。
- 新建默认值为 `book`；编辑已有 Emoji 学科而未改选时必须原样保存。
- 不更改 API、`Subject` 接口字段类型、同步语义或与学科无关的 Emoji。
- 语义键在 SVG 可用的位置显示线条图标；空值或未知语义键使用书本回退。
- 原生 `<select>` 不嵌入 SVG：旧 Emoji 保留前缀，语义键只显示学科名。
- 命令验证与浏览器/Tauri GUI 验收分开记录。

---

## 文件边界

| 文件 | 责任 |
| --- | --- |
| `Auralis-PC/src/utils/subjectIcon.ts` | 声明新建可选的语义键，识别历史值，并解析为线条图标组件。 |
| `Auralis-PC/src/components/subject/SubjectCreateModal.vue` | 提供线条图标选择、预览和编辑旧 Emoji 时的保留行为。 |
| `Auralis-PC/src/views/SubjectHall/index.vue` | 在学科卡片渲染语义图标或历史 Emoji。 |
| `Auralis-PC/src/views/SubjectWorkspace/index.vue` | 在侧栏与欢迎区渲染语义图标或历史 Emoji。 |
| `Auralis-PC/src/views/Timeline/index.vue` | 为原生学科选择器保留旧 Emoji 前缀，隐藏语义键文本。 |
| `Auralis-PC/scripts/check-subject-icon-rendering.mjs` | 静态验证图标键、创建器和各展示位置的契约。 |
| `Auralis-PC/package.json` | 增加图标契约检查命令与直接依赖声明。 |

### Task 1: 先建立会失败的线条图标契约

**Files:**
- Modify: `Auralis-PC/scripts/check-subject-icon-rendering.mjs`
- Modify: `Auralis-PC/package.json`

**Interfaces:**
- Produces: `npm.cmd run check:subject-icons`，在实现前因缺少语义图标导出和创建器接入而失败。

- [ ] **Step 1: 把契约脚本改为读取创建器、工具、学科大厅、工作区和时间线**

```js
const modal = await readFile(new URL('components/subject/SubjectCreateModal.vue', root), 'utf8')
const timeline = await readFile(new URL('views/Timeline/index.vue', root), 'utf8')

assert.match(iconUtility, /export const subjectIconOptions/, 'new subjects need a line-icon option list')
assert.match(iconUtility, /export const isSubjectIconKey/, 'rendering must distinguish semantic keys from legacy values')
assert.match(iconUtility, /@element-plus\/icons-vue/, 'semantic keys must resolve to Element Plus outline icons')
assert.match(modal, /subjectIconOptions/, 'create modal must source its choices from the shared option list')
assert.match(modal, /<ElIcon/, 'create modal preview and choices must render outline icons')
assert.match(workspace, /isSubjectIconKey\(activeSubject\?\.icon\)/, 'workspace must preserve legacy Emoji while rendering new keys')
assert.match(hall, /isSubjectIconKey\(subj\.icon\)/, 'hall must preserve legacy Emoji while rendering new keys')
assert.match(timeline, /isSubjectIconKey\(subj\.icon\)/, 'native select must not print semantic keys')
```

- [ ] **Step 2: 注册检查命令**

```json
"check:subject-icons": "node scripts/check-subject-icon-rendering.mjs"
```

- [ ] **Step 3: 执行契约检查，确认当前代码失败**

Run: `npm.cmd run check:subject-icons`（工作目录：`Auralis-PC`）

Expected: 退出码非零，首个失败断言指出缺少 `subjectIconOptions` 或创建器线条图标接入。

### Task 2: 实现共享语义键与创建器

**Files:**
- Modify: `Auralis-PC/package.json`
- Modify: `Auralis-PC/package-lock.json`
- Modify: `Auralis-PC/src/utils/subjectIcon.ts`
- Modify: `Auralis-PC/src/components/subject/SubjectCreateModal.vue`

**Interfaces:**
- Consumes: Task 1 的静态契约。
- Produces: `SubjectIconKey`、`subjectIconOptions`、`isSubjectIconKey(icon?: string | null): boolean`、`getSubjectIconComponent(icon?: string | null): Component` 与 `getLegacySubjectIcon(icon?: string | null): string | null`。

- [ ] **Step 1: 将图标包提升为直接运行时依赖**

```json
"@element-plus/icons-vue": "^2.3.2"
```

运行 `npm.cmd install --package-lock-only --ignore-scripts`（工作目录：`Auralis-PC`），只更新 lockfile 元数据，不升级其他依赖。

- [ ] **Step 2: 实现类型安全的语义键注册表**

```ts
import type { Component } from 'vue'
import { Collection, Cpu, DataAnalysis, EditPen, MagicStick, Monitor, Opportunity, Reading, School, Setting, Trophy } from '@element-plus/icons-vue'

export const subjectIconOptions = [
  { key: 'book', label: '阅读', component: Collection },
  { key: 'reading', label: '文献', component: Reading },
  { key: 'code', label: '编程', component: Cpu },
  { key: 'computer', label: '计算机', component: Monitor },
  { key: 'analysis', label: '分析', component: DataAnalysis },
  { key: 'school', label: '学术', component: School },
  { key: 'art', label: '创作', component: MagicStick },
  { key: 'notes', label: '笔记', component: EditPen },
  { key: 'idea', label: '灵感', component: Opportunity },
  { key: 'settings', label: '工程', component: Setting },
  { key: 'achievement', label: '成果', component: Trophy }
] as const

export type SubjectIconKey = (typeof subjectIconOptions)[number]['key']
const iconComponents: Record<SubjectIconKey, Component> = Object.fromEntries(
  subjectIconOptions.map(({ key, component }) => [key, component])
) as Record<SubjectIconKey, Component>

export const isSubjectIconKey = (icon?: string | null): icon is SubjectIconKey =>
  !!icon && Object.hasOwn(iconComponents, icon.trim())

export const getSubjectIconComponent = (icon?: string | null): Component =>
  isSubjectIconKey(icon) ? iconComponents[icon.trim()] : iconComponents.book

export const getLegacySubjectIcon = (icon?: string | null): string | null => {
  const value = icon?.trim()
  return value && !isSubjectIconKey(value) ? value : null
}
```

- [ ] **Step 3: 将创建器的默认值、预览和选择网格接到注册表**

```vue
<div class="preview-card" :style="{ backgroundColor: form.color }">
  <ElIcon v-if="isSubjectIconKey(form.icon)" :size="28"><component :is="getSubjectIconComponent(form.icon)" /></ElIcon>
  <span v-else>{{ getLegacySubjectIcon(form.icon) || '📚' }}</span>
</div>

<button
  v-for="option in subjectIconOptions"
  :key="option.key"
  type="button"
  class="icon-btn"
  :class="{ 'is-selected': form.icon === option.key }"
  :title="option.label"
  :aria-label="`选择${option.label}图标`"
  @click="form.icon = option.key"
>
  <ElIcon :size="20"><component :is="option.component" /></ElIcon>
</button>
```

将新建表单默认值改为 `book`。`onMounted` 保持 `props.subjectData.icon || 'book'`，因此旧 Emoji 在编辑但未改选时不会被覆盖。把 `.emoji-grid`/`.emoji-btn` 重命名为 `.icon-grid`/`.icon-btn`，保留现有选中、hover、键盘焦点可见的边框状态。

- [ ] **Step 4: 运行静态契约检查，确认通过**

Run: `npm.cmd run check:subject-icons`（工作目录：`Auralis-PC`）

Expected: 退出码 0，输出 `Subject icon rendering contract passed.`

- [ ] **Step 5: 提交共享图标与创建器**

```powershell
git add Auralis-PC/package.json Auralis-PC/package-lock.json Auralis-PC/src/utils/subjectIcon.ts Auralis-PC/src/components/subject/SubjectCreateModal.vue Auralis-PC/scripts/check-subject-icon-rendering.mjs
git commit -m "feat: add line icons for new subjects"
```

### Task 3: 让页面按值类型渲染图标

**Files:**
- Modify: `Auralis-PC/src/views/SubjectHall/index.vue`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Modify: `Auralis-PC/src/views/Timeline/index.vue`

**Interfaces:**
- Consumes: `isSubjectIconKey`、`getSubjectIconComponent`、`getLegacySubjectIcon`。
- Produces: 新建学科在卡片、工作区侧栏/欢迎页显示线条图标，旧 Emoji 在同一位置维持原样。

- [ ] **Step 1: 用分支模板替换大厅卡片的字符串插值**

```vue
<ElIcon v-if="isSubjectIconKey(subj.icon)" :size="28">
  <component :is="getSubjectIconComponent(subj.icon)" />
</ElIcon>
<span v-else>{{ getLegacySubjectIcon(subj.icon) || '📚' }}</span>
```

从 `subjectIcon.ts` 导入三个新函数，并在 `.subject-card-icon` 保留现有的水平/垂直居中样式。

- [ ] **Step 2: 在工作区的侧栏与欢迎页复用同一分支**

```vue
<ElIcon v-if="isSubjectIconKey(activeSubject?.icon)" :size="24">
  <component :is="getSubjectIconComponent(activeSubject?.icon)" />
</ElIcon>
<span v-else>{{ getLegacySubjectIcon(activeSubject?.icon) || '📚' }}</span>
```

侧栏使用 `:size="24"`；欢迎区使用同一条件分支但 `:size="60"`。删除工作区里直接输出 `activeSubject?.icon` 的模板插值，保留不属于学科图标的空状态 Emoji。

- [ ] **Step 3: 处理原生任务选择器的不可嵌入 SVG 限制**

```vue
<option v-for="subj in subjectStore.subjects" :key="subj.id" :value="subj.id">
  {{ isSubjectIconKey(subj.icon) ? '' : `${getLegacySubjectIcon(subj.icon) || ''} ` }}{{ subj.name }}
</option>
```

从工具导入 `isSubjectIconKey` 和 `getLegacySubjectIcon`，不要在 `<option>` 中输出语义键（如 `book`）。

- [ ] **Step 4: 运行契约检查，确认页面接入完成**

Run: `npm.cmd run check:subject-icons`（工作目录：`Auralis-PC`）

Expected: 退出码 0，输出 `Subject icon rendering contract passed.`

- [ ] **Step 5: 提交页面渲染改动**

```powershell
git add Auralis-PC/src/views/SubjectHall/index.vue Auralis-PC/src/views/SubjectWorkspace/index.vue Auralis-PC/src/views/Timeline/index.vue Auralis-PC/scripts/check-subject-icon-rendering.mjs
git commit -m "feat: render new subject icons as outlines"
```

### Task 4: 完整验证并回写现行文档

**Files:**
- Modify: `docs/design/Frontend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: 通过的静态契约与构建命令输出。
- Produces: 现行设计、模块、状态、风险与发布记录中的本轮代码/命令/GUI 验收边界。

- [ ] **Step 1: 执行静态契约和生产构建**

Run: `npm.cmd run check:subject-icons; npm.cmd run build`（工作目录：`Auralis-PC`）

Expected: 两个命令均退出码 0；第二个命令完成 `vue-tsc -b && vite build`。若命令失败，保留实际输出并在修复后重跑，不能把失败写成通过。

- [ ] **Step 2: 回写视觉和模块事实**

在 `docs/design/Frontend.md` 的 SubjectWorkspace 规则中增加：新建学科以线条图标显示，历史 Emoji 保留原样，空值/未知语义键回退书本。在 `docs/modules/FrontendPC.md` 更新 `subjectIcon.ts` 描述与命令表，增加 `npm.cmd run check:subject-icons` 的证明范围和不证明事项。

- [ ] **Step 3: 回写本轮证据和未关闭 GUI 风险**

在 `docs/current/Status.md` 记录本轮实际命令日期、完整命令和结果；在 `docs/current/IssuesAndReview.md` 把图标 GUI 验收的关闭条件更新为“新建线条图标、旧 Emoji、空值/未知键”三类显示都经浏览器或 Tauri 检查。不要把构建通过写成 GUI 验收通过。

- [ ] **Step 4: 回写变更记录和索引**

在 `docs/release/Changelog.md` 的 Unreleased 区记录：新建学科改用线条图标、旧 Emoji 不迁移，及本轮实际通过的命令；在 `docs/README.md` 的项目与设计索引登记本设计和本实施计划。

- [ ] **Step 5: 执行文档差异和格式检查**

Run: `git diff --check`（工作目录：仓库根目录）

Expected: 退出码 0，无尾随空格或补丁格式错误。

- [ ] **Step 6: 提交验证与文档回写**

```powershell
git add docs/design/Frontend.md docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md docs/README.md
git commit -m "docs: record PC subject line icon rollout"
```
