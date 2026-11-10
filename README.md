# dsh-osc-harness-sidebar

> 把 DeepSeek Harness 变成你自己的 Agent Harness — 外壳层：可配置的产品导航轨。

[![npm](https://img.shields.io/npm/v/dsh-osc-harness-sidebar.svg)](https://www.npmjs.com/package/dsh-osc-harness-sidebar)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![CI](https://github.com/feralpixel2026/dsh-osc-harness-sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/feralpixel2026/dsh-osc-harness-sidebar/actions/workflows/ci.yml)

`dsh-plugin` `dsh-bundle` `deepseek-harness` `cordis` `sidebar` `navigation` `ai-agent`

---

## 为什么做这个

DSH 默认的侧栏服务的是「一个对话应用」：会话列表、插件管理、设置。

但当你把 DSH 当作一个**多能力宿主**（例如接入一整套 DevOps 产品）时，侧栏要回答的是另一个问题：

> 「这个平台上现在有哪些能力、它们怎么分组、我要先找哪一个？」

这个插件就是那层外壳。它不改 DSH 一行源码，只接管 `sidebar` 席位，把左列重画成两条：

```
┌──────────────┬────────────────────────┐
│  产品轨       │  当前能力的二级导航      │   ← 左列被切成两半
│  （本插件）   │  （由各能力插件提供）    │
└──────────────┴────────────────────────┘
```

**原生会话与 Agent 循环没有被替换掉，而是变成轨道上的其中一项**，和你新增的能力并列。

---

## 界面

左侧栏变成：

```
OSCHINA HARNESS              ← 品牌标

AI Harness                   ← 分组标题
  大肥鱼 DSH                 ← 内置项：点它回到 DSH 原生会话

协作域 / 开发域 / 持续集成交付域 / 安全域 / 平台域

──── 底部 ────
  插件管理
  导航配置                    ← 分组、排序、显隐都在这里配
  登录
```

- **产品轨**：分组标题 + 各能力注册的行，带展开/收起
- **导航配置**：可视化增删分组、改名、拖动排序、显隐开关
- **大肥鱼 DSH**：内置出口，点它切开右侧列、恢复 DSH 原生导航

---

## 快速开始

### 前置

- DSH 0.2.x
- Node.js >= 22

### DSH 有两个版本，装法不同

| 形态 | 装法 |
|---|---|
| 桌面版（Electron） | 方式 A |
| Web 版（浏览器） | 方式 B |
| 已在 DSH 会话里 | 方式 C |

### 方式 A：桌面版（推荐）

1. 打开 DSH 桌面版
2. 设置 → 插件 → 从 npm 安装
3. 输入 `dsh-osc-harness-sidebar`
4. 重启 DSH

### 方式 B：Web 版

在 profile 目录（如 `~/.dsh/profiles/desktop/`）执行：

```sh
npm install dsh-osc-harness-sidebar
```

然后编辑同目录的 `package.json`，在 `bundles` 数组中加入：

```json
"bundles": [
  "...",
  "dsh-osc-harness-sidebar"
]
```

重启 DSH Web 服务。

### 方式 C：已在 DSH 会话里

把这个仓库地址发给 DSH 的 Agent，让它按方式 B 操作。

### 验证装好了

```sh
# 确认包在位
ls ~/.dsh/profiles/desktop/node_modules/dsh-osc-harness-sidebar

# 确认 bundles 里声明了
grep dsh-osc-harness-sidebar ~/.dsh/profiles/desktop/package.json
```

浏览器刷新后，左列应变成产品轨。

---

## 重要：本插件不含具体能力

**本插件只提供外壳：分组、排序、显隐、配置页。**

轨道上的具体能力由**其他插件**各自注册：

| 装上 | 会看到 |
|---|---|
| 只装本插件 | 分组标题 + **大肥鱼 DSH** + 配置页；`AI Harness` 之外的分组是空的 |
| 再装能力插件 A | 轨道上出现 A 那一行，点开是 A 的页面 |

**这是设计而非缺陷**：能力可以按需安装、单独升级、单独卸载，装不装某个能力不影响外壳。

---

## 内置项：大肥鱼 DSH

`大肥鱼 DSH` 是唯一内置的轨道项，它不是一个独立插件。

点它等价于**回到 DSH 原生会话**——右侧列恢复成会话区，DSH 自己的导航回到原位。它是「从产品模式退回会话模式」的出口，因此必须由外壳本身持有：它需要调用 `ctx.layout.selectPanel(null)`，那是外壳才有的能力。

---

## 导航配置

底部「导航配置」打开配置页，可以：

| 操作 | 说明 |
|---|---|
| **新建分组** | 分组即刻出现在轨道上 |
| **重命名** | 双击分组名进入编辑，回车保存 |
| **拖动排序** | 按住行首的拖动手柄拖动，松手生效 |
| **显示 / 隐藏** | 隐藏的分组从轨道上消失，其下产品自动落回默认分组 |
| **默认展开** | 控制该分组进页面时是否展开 |
| **删除分组** | 该分组下的产品不会被删除，回到默认分组末尾 |

### 默认分组的行为

列表第一个是**默认分组**（不画标题）。它承接所有「无归属」的产品，身份完全固定：

- 不能隐藏
- 不能设为收起
- 不能删除
- **不能改名**

**隐藏或删除某个分组时，它下面的产品会被追加到默认分组已有产品之后，不会消失。**

配置改动即时生效，刷新后保留。

---

## 安装是怎么做的

DSH 的插件系统是 Cordis。本插件提供两个文件：

| 文件 | 作用 |
|---|---|
| `index.js` | Host 侧入口，`apply()` 为空——不需要任何 Host 服务 |
| `client.js` | 浏览器侧全部实现，由 DSH Web shell 通过 `dsh.client` 清单加载 |
| `cordis.patch.yml` | 禁用 `ui-sidebar`、占用 `sidebar` 席位 |

**禁用 `ui-sidebar` 写在 bundle 补丁里，而不是你的 profile 补丁里**——这样卸载本插件时，原生侧栏会自动恢复，不会留下半残状态。

---

## 注意事项

### 与其他侧栏插件互斥

本插件接管 `sidebar` 席位。**不要与其他接管同一席位的侧栏插件同时启用**，否则会出现 `already declared` 错误或列宽错乱。

### 依赖

**零运行时依赖。** 不依赖任何其他插件或共享库，可以单独安装、单独卸载。

---

## 兼容性

| 项 | 值 |
|---|---|
| DSH | 0.2.x |
| Node.js | >= 22 |
| 平台 | Web（`dsh.client.platform` 为 `web`） |
| 注入的客户端服务 | `@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-slots` |

---

## 包结构

单文件前端包，**没有构建步骤**：

```
index.js             Host 侧入口（无 Host 服务，apply 为空）
client.js            浏览器侧全部实现（约 96 KB，含样式）
cordis.patch.yml     bundle 补丁：禁用 ui-sidebar，占用 sidebar 席位
icon.svg             图标
locale/zh.json       中文文案
locale/en.json       英文文案
```

`client.js` 是手写并经过验证的产物，不经过打包器。样式以内联 CSS 形式随包分发，运行时挂到产品页容器上，作用域限定在容器内，不影响宿主样式。

---

## 文档

| 文件 | 内容 |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| [SECURITY.md](SECURITY.md) | 安全策略与漏洞报告 |

---

## 开发

本仓库只包含运行时文件，不包含构建流程。

```sh
npm run check    # 语法检查
npm test         # 运行测试
npm run verify   # check + test（发布前自动执行）
```

修改 `client.js` 后需重新加载 DSH 的 Web 界面。

---

## 安全边界

本插件：

- **不发起任何网络请求**
- **不读取任何用户文件**（除 `localStorage` 保存的导航配置）
- **不提升任何权限**
- 唯一的持久化是浏览器 `localStorage` 中的分组配置

安全问题的报告方式见 [SECURITY.md](SECURITY.md)。

---

## 相关插件

本插件是外壳，不含具体能力。若需要配套的能力插件，见 `dsh-product-*` 系列（每个是一个独立插件，各自提供一行导航和一个页面）。

---

## 许可证

[Apache-2.0](LICENSE)
