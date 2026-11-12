# 贡献指南

## 这个项目是什么

`dsh-osc-harness-sidebar` 是一个 DSH（DeepSeek Harness）侧栏插件，接管原生左侧栏并渲染可配置的产品导航轨。

**它不含具体的产品能力。** 轨道上的每一行由独立的产品插件注册；本插件只提供外壳、分组配置与配置页。提 Issue 或 PR 前请先确认问题属于外壳层（分组、排序、显隐、轨道渲染）还是某个产品插件。

## 开发环境

- Node.js >= 22
- 一个可用的 DSH profile（用于在浏览器里验证渲染）

```sh
git clone https://github.com/feralpixel2026/dsh-osc-harness-sidebar.git
cd dsh-osc-harness-sidebar
npm run verify
```

**本仓库没有构建步骤。** `client.js` 是手写并随包分发的产物，不经过打包器。修改后重新加载 DSH 的 Web 界面即可看到效果。

## 可用的脚本

| 命令 | 作用 |
|---|---|
| `npm run check` | 对 `index.js` 和 `client.js` 做语法检查 |
| `npm test` | 运行 `test/*.test.mjs` |
| `npm run verify` | `check` + `test`，发布前由 `prepublishOnly` 自动执行 |

## 修改 `client.js` 的约定

`client.js` 是单文件手写实现，没有类型系统兜底，因此约定更严：

1. **注释解释「为什么」，不复述「做了什么」。** 这段代码最难维护的部分是生命周期与席位约束，不是控制流。
2. **样式必须作用域限定。** 注入到页面的 CSS 一律挂在 `[data-dsh-product-page]` 之下，不做全局 `.ant-*` 覆盖，不使用 `!important`。
3. **不用会随宿主主题翻转的 CSS 变量决定产品页外观。** 产品页固定在浅色板上，深色主题下必须仍然可读。
4. **改完跑 `npm run verify`。** 没有构建步骤意味着没有编译期保护，测试是唯一的自动防线。

## 提交

- 一个 PR 只做一件事。与主题无关的重构请单独开 PR。
- 提交信息用祈使句描述行为变化，例如：
  - `fix: keep default group reachable when its neighbours are hidden`
  - `feat: keep the product rail folded across reloads`
- 行为有变更时同步更新 `CHANGELOG.md`。

## 报告问题

- **功能缺陷**：用 bug 模板提 Issue，附上 DSH 版本、操作系统、以及复现步骤。
- **安全问题**：不要开公开 Issue，走 [SECURITY.md](SECURITY.md) 的私下渠道。

## 许可证

提交的贡献按 [Apache-2.0](LICENSE) 授权。
