# @civilization/dsh-git-sidebar

**IntelliJ IDEA 级别的专业 Git 版本控制工作台插件，专为 DeepSeek Harness (DSH) 打造。**

本插件为 DeepSeek Harness 提供了媲美 IntelliJ IDEA / VS Code 的全套 Git 工程化版本控制能力，包括 **DAG 拓扑提交图谱**、**多分支合并轨道渲染**、**工作区变动检查与暂存提交**、**底部分支快速切换胶囊**、**全量标签管理与 DAG 视图定位**、**彩色代码差异对比**，以及供 AI Agent 自主调用的 **Git 原生模型工具集**。

> **说明**：本插件已实现完全独立化拆分，**严格仅依赖官方公开 API 组件**（`@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools` 及 React 18），**没有任何私有组件库或单体仓库内部包的依赖**，可在官方纯净版 DeepSeek Harness 环境中直接安装使用。

---

## 🌟 核心特性

### 1. 🌲 IntelliJ IDEA 级 DAG 提交拓扑树与轨道图
- **多泳道动态压缩算法**：根据提交历史（`git log --parents`）精确计算并排分支泳道，支持主线、特性分支、热修复分支与合并分支。
- **平滑贝塞尔曲线连线**：基于 SVG 实时渲染分支分叉与合并连接线，采用 IntelliJ 调色板渲染多彩轨道。
- **提交引用徽章**：直接在提交节点旁渲染带颜色与边框的 `HEAD`、当前分支（高亮绿）、本地分支（蓝）、远程分支（紫）与发布标签（橙）。
- **Conventional Commits 智能解析**：自动解析 `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` 等类型前缀，渲染高对比度彩色胶囊。
- **主线筛选与全文过滤**：支持「全部 / 仅主线」切换，并提供按 Commit Hash、提交信息、作者名字的即时高亮检索。

### 2. 🗂️ 工作区代码改动（Changes）与快捷提交控制台
- **三态工作区树形/扁平分类**：
  - **已暂存改动 (Staged Changes)**
  - **未暂存改动 (Changes)**
  - **未追踪文件 (Untracked Files)**
- **快速动作支持**：单文件/批量一键 Stage、Unstage、丢弃更改（Discard）、全选暂存。
- **快捷提交控制台 (Commit Console)**：
  - 内置提交说明输入框，支持 `Ctrl+Enter` 快速提交；
  - 顶部集成常见 Conventional Commits 前缀快捷插入芯片（`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`）。
- **实时同步工具栏**：支持一键 `Fetch`、`Pull`、`Push` 与 `Refresh`。

### 3. 🏷️ 全量标签管理器（Tags）与 DAG 拓扑精确定位
- **完整标签视图**：展示仓库所有 Tag 列表，包含短哈希、提交日期、相对时间、打标作者与附注说明（Annotated Message）。
- **标签创建与删除**：支持创建轻量标签（Lightweight）或带说明的附注标签（Annotated），支持为指定 Commit 打标。
- **一键精确定位与视口居中**：在标签列表中点击「在拓扑树中定位」图标，自动切换到提交图谱视图，精确定位至对应 Commit 节点并带有呼吸光晕高亮与平滑滚动居中。

### 4. 🔀 状态栏底部分支切换胶囊（Composer Dock Pill）
- 注入官方对话框底部的 Composer Dock 状态栏（顺序优先）；
- 实时展示当前所在分支与远程追踪状态（`↑ahead` 本地领先 / `↓behind` 落后远程）；
- 点击弹出类似 VS Code / IDEA 的分支浮层面板，支持分支即时过滤、快捷切换（Checkout）、创建新分支（`git checkout -b`）与快捷 Pull / Push。

### 5. 🔍 彩色代码差异对比查看器（Unified Diff）
- 点击工作区任意改动文件或 DAG 拓扑图中的任意提交，右侧立即展开对应代码差异；
- 增删行彩色对比高亮（绿色背景新增、红色背景删除、淡紫色块头范围定位）。

### 6. 🤖 AI Agent 原生感知与控制模型工具集
插件自动向模型注入以下标准 Tools：
- `git_view`：自主查询状态、提交图谱、分支列表、差异内容与标签列表。
- `git_checkout`：自主切换分支或创建检出新分支。
- `git_tag`：自主创建版本标签或清理临时标签。

---

## 🏗️ 架构与技术实现

- **独立双端输出**：
  - **Host Node 端** (`lib/index.js`)：采用标准 Cordis ESM 插件规范，注册 `/git` 安全 RPC 拦截器与 Agent 工具。
  - **Client Browser 端** (`lib/client.js`)：打包为自包含的浏览器端模块，遵循 `window.__ModuleLoader__.load({ id: '@civilization/dsh-git-sidebar', factory: ... })` 协议。
  - **自包含样式编译**：利用 `lightningcss` 在构建期将 CSS Modules 直接转译并内联在 Client bundle 中，载入时自动注入 `<style data-plugin="@civilization/dsh-git-sidebar">`，无需宿主额外加载外部 CSS。
- **公共依赖**：
  - `@deepseek-ai/cordis`: `^4.0.0`
  - `@deepseek-ai/dsh-tools`: `^0.2.0`
  - `@deepseek-ai/schemastery`: `^3.18.5`
  - `react`: `^18.0.0`

---

## 📥 安装与使用指南

### 1. 安装依赖

在官方 DeepSeek Harness 运行时环境或项目中安装：

```bash
pnpm add @civilization/dsh-git-sidebar
```

### 2. 在 `cordis.yml` 中启用插件

编辑运行配置文件 `cordis.yml`（或通过 `cordis.patch.yml`）：

```yaml
plugins:
  - name: "@civilization/dsh-git-sidebar"
```

启动 DeepSeek Harness 后，右侧栏将出现专属的 **Git** 图标标签页，底部状态栏将展示实时的分支胶囊。

---

## ⌨️ 快捷键

- `Ctrl + Shift + G`（Windows / Linux）或 `Cmd + Shift + G`（macOS）：一键呼出并聚焦右侧 Git 工作台。
- `Ctrl + Enter`：在提交信息框中一键触发提交。

---

## 🛠️ 本地开发与测试

```bash
# 进入插件目录
cd D:\project\dsh-plugins\dsh-git-sidebar

# 安装依赖
pnpm install

# 静态类型检查
pnpm run typecheck

# 单元测试（基于 Vitest）
pnpm run test

# 生产环境打包构建
pnpm run build
```

---

## 📄 开源许可证

本项目基于 [Apache-2.0](./LICENSE) 协议开源。
