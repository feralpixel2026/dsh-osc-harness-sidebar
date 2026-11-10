# Changelog

本文件记录所有值得注意的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.1] - 2026-11-10

开源发布配套。代码行为无变化。

### 新增

- `README.md` 增加徽章、关键词行、三种安装路径（桌面版 / Web 版 / 会话内）与装完自检步骤
- `README.md` 增加安全边界一节，逐项列出插件做什么、不做什么
- `CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`
- `test/package.test.mjs`：针对清单、席位补丁与 bundle 不变量的 16 条结构测试
- CI（Node 22 / 24 × Linux / Windows）与标签触发的发布工作流
- Issue 模板（bug / feature request）
- `package.json` 增加 `scripts`、`publishConfig`、`author`、`engines`、`keywords`

### 修复

- **文档与行为不一致**：README 曾称默认分组可以重命名，而代码中双击默认分组会直接返回、不接受改名。现按代码行为统一为「不能改名」，并新增一条测试把 README 与 CHANGELOG 的措辞绑到处理函数上，防止二者再次漂移。

## [0.3.2] - 2026-11-10

导航配置页的可操作性与主题一致性修复，并补齐扩展文档。

### 新增

- **README 中英双语**：`README.md`（中文）、`README.en.md`（English），顶部互相链接
- **README 新增「写一个插件接入这个导航」**：槽位清单、最小可运行插件示例、注册字段规则、右列与 `sidebar.columns` 的配合、注册时机、图标约定
- 默认可见分组收窄：出厂只显示默认分组与 AI Harness，其余业务域分组默认隐藏

### 修复

- **新建的分组名称错误且开关无响应**：自定义分组的名称存在 `customLabel` 键上，而全部消费方读取 `section.label`，名称恒为 `undefined`；同时默认分组判定写成 `labelKey === null`，而自定义分组的 `labelKey` 同样是 `null`，导致每个新建分组都被当作默认分组——不画标题、显隐与展开开关被锁定。名称统一到 `label`，判定改为按 `id === 'g-default'`
- **配置页配色不跟随主题**：30 处硬编码颜色改为宿主 `--dsw-*` 变量，深色主题下不再出现白底面板配深色外壳
- **导航配置有两个入口**：删除 DSH 设置面板中的重复入口，只保留轨道左下角一处

### 变更

- 分组改名入口改为名称后的铅笔图标（悬停显现），不再占用操作列——放进操作列会让该列在不同行之间宽度不一致，表头随之错位
- 「恢复默认」写入出厂配置而非空对象

## 设计决定

- **默认分组是完全固定的锚点**：它承接所有无归属的产品，因此不能隐藏、不能设为收起、不能删除、不能改名。删除或隐藏其他分组时，其下产品被追加到默认分组末尾而不是消失。
- **禁用 `ui-sidebar` 写在 bundle 补丁里**，不在 profile 补丁里。这样卸载本插件时原生侧栏自动恢复，不留半残状态。
- **零运行时依赖**：不 require 任何其他插件或共享库，可单独安装与卸载。
- **单文件前端包，无构建步骤**：`client.js` 手写并随包分发，样式内联且以 `.pn-` 前缀命名空间化。
- **内置「大肥鱼 DSH」不拆成独立插件**：它要调用 `ctx.layout.selectPanel(null)` 切回原生会话，那是席位占用者才有的能力。

## [0.3.0] - 2026-11-10

首个公开发布版本。

### 新增

- 接管 DSH `sidebar` 席位，把左列切成产品轨与二级导航两条
- 导航配置页：分组的新建、重命名、拖动排序、显隐开关、默认展开、删除
- 内置「大肥鱼 DSH」轨道项，点击回到 DSH 原生会话
- 分组配置持久化到 `localStorage`，刷新后保留
- 中英文词典（`locale/zh.json`、`locale/en.json`）

### 已知限制

- 不能与其他接管 `sidebar` 席位的插件同时启用
- 轨道上的具体能力需由独立的产品插件注册，本插件只提供外壳

[0.3.2]: https://github.com/feralpixel2026/dsh-osc-harness-sidebar/releases/tag/v0.3.2
[0.3.1]: https://github.com/feralpixel2026/dsh-osc-harness-sidebar/releases/tag/v0.3.1
[0.3.0]: https://github.com/feralpixel2026/dsh-osc-harness-sidebar/releases/tag/v0.3.0
