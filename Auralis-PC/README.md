# Auralis PC

更新时间：2026-10-28

文档状态：模块入口

权威范围：PC 开发文档导航

事实来源：`package.json`、`index.html` 与 PC 模块文档

PC 使用 Vue 3、TypeScript、Vite 和 Tauri。开始修改前，从[文档中心](../docs/README.md)阅读必读规则；当前目录、运行命令和实现边界见 [PC 模块](../docs/modules/FrontendPC.md)，交互与视觉规范见[前端设计](../docs/project/FrontendDesign.md)。

应用入口是 `src/main.ts`。`src/` 中与 TypeScript、Vue 源码同名的编译输出应清理，不作为另一份源码维护；现有 TypeScript 配置继承 `noEmit: true`。
