# Changelog

本文件记录所有值得注意的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-11-10

首个公开发布版本。

### 新增

- 接管 DSH `sidebar` 席位，把左列切成产品轨与二级导航两条
- 导航配置页：分组的新建、重命名、拖动排序、显隐开关、默认展开、删除
- 内置「大肥鱼 DSH」轨道项，点击回到 DSH 原生会话
- 分组配置持久化到 `localStorage`，刷新后保留
- 中英文词典（`locale/zh.json`、`locale/en.json`）

### 设计决定

- **默认分组是完全固定的锚点**：它承接所有无归属的产品，因此不能隐藏、不能设为收起、不能删除、不能改名。删除或隐藏其他分组时，其下产品被追加到默认分组末尾而不是消失。
- **禁用 `ui-sidebar` 写在 bundle 补丁里**，不在 profile 补丁里。这样卸载本插件时原生侧栏自动恢复，不留半残状态。
- **零运行时依赖**：不 require 任何其他插件或共享库，可单独安装与卸载。
- **单文件前端包，无构建步骤**：`client.js` 手写并随包分发，样式内联且作用域限定在产品页容器内。

### 已知限制

- 不能与其他接管 `sidebar` 席位的插件同时启用
- 轨道上的具体能力需由独立的产品插件注册，本插件只提供外壳

[0.3.0]: https://github.com/feralpixel2026/dsh-osc-harness-sidebar/releases/tag/v0.3.0
