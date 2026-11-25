# PC Subject 全局主题色清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline, test-first execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 PC 页面中已废弃的 `Subject.color` 读取，使 Subject 统一使用现行全局主题色，并修复 Home 的学科创建参数错误。

**Architecture:** Subject API、数据模型和数据库不提供颜色字段；页面不再向 Subject Store 传递颜色，也不从 Subject 读取颜色。原本由 Subject 颜色驱动的视觉属性改为复用 `#7D9372` 全局语义色。

**Tech Stack:** Vue 3、Pinia、TypeScript、Node assertion-based PC regression scripts.

## Global Constraints

- 不恢复 Subject 颜色字段，不修改服务端、OpenAPI、数据库或生成 SDK。
- 删除弃用的 `Subject.color` 页面依赖；不增加兼容字段或回退。
- 保留 Task 与 KnowledgeBlock 现行的 `colorOverride` 语义。
- 保护用户现有工作树，不创建提交。

---

### Task 1: 清除 Subject 颜色残留并修复创建调用

**Files:**

- Modify: `Auralis-PC/src/views/Dashboard/index.vue`
- Modify: `Auralis-PC/src/views/Home/index.vue`
- Modify: `Auralis-PC/src/views/Timeline/index.vue`
- Modify: `Auralis-PC/scripts/r4-store-mapping.test.mjs`

**Interfaces:**

- Consumes: `SubjectModel`（不含 `color`）、`useSubjectStore.addSubject(name, description, icon)`。
- Produces: 三个页面不读取 `Subject.color`；Home 创建路径只传三个参数。

- [x] **Step 1: 写出失败回归**

```js
assert.doesNotMatch(page, /subj\.color|selectedSubj\.color|activeSubject\?\.color/)
assert.match(home, /subjectStore\.addSubject\(formData\.name, formData\.description, formData\.icon\)/)
```

- [x] **Step 2: 运行失败回归**

Run: `node --experimental-strip-types --test --test-name-pattern "PC subject views use the global theme" scripts/r4-store-mapping.test.mjs`

Expected: FAIL because the three page templates still reference `Subject.color` and Home passes a fourth argument.

- [x] **Step 3: 最小实现**

```ts
const SUBJECT_THEME_COLOR = '#7D9372'

await subjectStore.addSubject(formData.name, formData.description, formData.icon)
```

Replace only Subject-derived style values with the global color; do not alter Task or KnowledgeBlock color values.

- [x] **Step 4: 运行定向验证**

Run: `node --experimental-strip-types --test scripts/r4-store-mapping.test.mjs`

Expected: PASS.

### Task 2: 回写当前 PC 事实

**Files:**

- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**

- Consumes: Subject 无颜色字段、统一 `#7D9372` 主题色的产品决定。
- Produces: 当前模块边界、状态、风险和发布记录说明已删除页面残留。

- [x] **Step 1: 记录现行行为与验证边界**

Document that Subject keeps the shared semantic color and has no persisted color; record targeted test result and any unrelated type-check blocker without claiming GUI acceptance.

- [x] **Step 2: 运行类型检查与差异检查**

Run: `npm run type-check` and `git diff --check -- Auralis-PC/src/views/Dashboard/index.vue Auralis-PC/src/views/Home/index.vue Auralis-PC/src/views/Timeline/index.vue`

Expected: type-check no longer reports `Subject.color`; unrelated failures, if any, are recorded exactly. Diff check reports no whitespace errors.
