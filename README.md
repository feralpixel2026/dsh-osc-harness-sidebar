# dsh-osc-harness-sidebar

**把 DeepSeek Harness 变成你自己的 Agent Harness。**

一个 DSH（DeepSeek Harness）侧栏插件：接管原生左侧栏，换成可配置的产品导航轨。DSH 的原生会话与 Agent 循环不是被替换掉，而是变成轨道上的**其中一项能力**，和你新增的能力并列。

> **English summary**: A sidebar plugin for DeepSeek Harness. It takes over the native left column and renders a configurable product rail. The native conversation stays as one entry among the capabilities you add. Grouping, ordering and visibility are all configurable from a built-in settings page.

---

## 它解决什么问题

DSH 默认的侧栏服务的是「一个对话应用」：会话列表、插件管理、设置。

但当你把 DSH 当作一个**多能力宿主**（比如接入一整套 DevOps 产品）时，侧栏需要回答的是另一个问题：

> 「这个平台上现在有哪些能力、它们怎么分组、我要先找哪一个？」

这个插件就是那层外壳。它不改 DSH 一行源码，只接管 `sidebar` 席位，把左列重画成两条：

```
┌──────────────┬────────────────────────┐
│  产品轨       │  当前能力的二级导航      │   ← 左列被切成两半
│  （本插件）   │  （由各能力插件提供）    │
└──────────────┴────────────────────────┘
```

---

## 安装后的效果

装上本插件后，左侧栏会变成这样：

```
OSCHINA HARNESS              ← 品牌标

AI Harness                   ← 分组标题
  大肥鱼 DSH                 ← 内置项：点它回到 DSH 原生会话

协作域                        ← 分组标题（可能暂时是空的）
开发域
持续集成/交付域
安全域
平台域

──── 底部 ────
  插件管理
  导航配置                    ← 分组、排序、显隐都在这里配
  登录
```

### 重要：本插件不含具体能力

**本插件只提供外壳：分组、排序、显隐、配置页。**

轨道上的具体能力由**其他插件**各自注册。也就是说：

| 装上 | 会看到 |
|---|---|
| 只装本插件 | 分组标题 + **大肥鱼 DSH** + 配置页。`AI Harness` 之外的分组是空的 |
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

列表第一个是**默认分组**（不画标题）。它承接所有「无归属」的产品，因此有三条固定规则：

- 不能隐藏
- 不能设为收起
- 不能删除

**但可以重命名。** 隐藏或删除某个分组时，它下面的产品会被追加到默认分组已有产品之后，不会消失。

配置改动即时生效，刷新后保留。

---

## 安装

本插件是一个 DSH bundle，通过 DSH profile 安装。

### 从 npm 安装

```sh
npm install dsh-osc-harness-sidebar
```

然后在 profile 的 `bundles` 列表中加入 `dsh-osc-harness-sidebar`。

### 依赖

本插件**没有任何运行时依赖**。它不依赖任何其他插件或共享库，可以单独安装、单独卸载。

> 卸载本插件后，`cordis.patch.yml` 中对 `ui-sidebar` 的禁用会一并撤销，原生侧栏自动恢复。

### 与其他侧栏插件互斥

本插件接管 `sidebar` 席位，并禁用 `ui-sidebar`。**不要与其他接管同一席位的侧栏插件同时启用**，否则会出现「already declared」错误或列宽错乱。

---

## 兼容性

| 项 | 值 |
|---|---|
| DSH | 0.2.x |
| 平台 | Web（`dsh.client.platform` 为 `web`） |
| 注入的客户端服务 | `@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-slots` |

---

## 包结构

本插件是单文件前端包，没有构建步骤：

```
index.js             Host 侧入口（无 Host 服务，apply 为空）
client.js            浏览器侧全部实现（约 96 KB，含样式）
cordis.patch.yml     bundle 补丁：禁用 ui-sidebar，占用 sidebar 席位
icon.svg             图标
locale/zh.json       中文文案
locale/en.json       英文文案
```

`client.js` 是手写并经过验证的产物，不经过打包器。样式以内联 CSS 形式随包分发，并在运行时挂到产品页容器上，作用域限定在容器内，不影响宿主样式。

---

## 相关插件

本插件是外壳，不含具体能力。若需要配套的能力插件，见 `dsh-product-*` 系列（每个是一个独立插件，各自提供一行导航和一个页面）。

---

## 开发

本仓库只包含运行时文件，不包含构建流程。修改 `client.js` 后需重新加载 DSH 的 Web 界面。

---

## 许可证

MIT
