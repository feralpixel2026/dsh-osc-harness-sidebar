# DSH 侧栏席位与网格几何

本文只写**核实过的**内容：每一条都能在 `@deepseek-ai/dsh-client-ui-sidebar`、`dsh-client-ui-layout` 的打包产物或本插件源码里找到对应声明。核实方法见文末。

适用范围：承接 `sidebar` 席位、或需要理解两列几何的插件。不涉及会话区、文件树、右面板等与 `sidebar` 无关的席位。

---

## 一、`sidebar` 是 single 席位

`ui-sidebar` 用一次 `ctx.slots.register` 声明 `sidebar` 本身与它的 8 个子席位。占住 `sidebar` 的插件**继承这 8 个席位的声明权**——原占用者被遮蔽后，子席位一并消失，必须自己重新声明，否则往那些席位注册的第三方插件会抛「slot is not declared」。

```js
// ui-sidebar 的声明（打包产物中的原始结构，节选字段）
ctx.slots.register({
  name: 'sidebar',
  locale: NS,
  children: {
    'sidebar.brand.mark':      { kind: 'single', scope: 'root' },
    'sidebar.brand.name':      { kind: 'single', scope: 'root' },
    'sidebar.toggle.badge':    { kind: 'single', scope: 'root' },
    'sidebar.panellist':       { kind: 'list',   scope: 'root' },
    'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
    'sidebar.workspaces':      { kind: 'single', scope: 'root' },
    'sidebar.settings':        { kind: 'single', scope: 'root' },
    'sidebar.footer.action':   { kind: 'list',   scope: 'root' },
  },
})
```

## 二、原生子席位只有这 8 个

| 席位 | kind | 语义 |
|---|---|---|
| `sidebar.brand.mark` | single | 品牌行左侧标记（图标/字标） |
| `sidebar.brand.name` | single | 品牌行文字 |
| `sidebar.toggle.badge` | single | 折叠钮上的角标 |
| `sidebar.panellist` | list | 面板列表（会话之上的功能入口） |
| `sidebar.panellist.actions` | list | 面板列表末尾的操作区 |
| `sidebar.workspaces` | single | 工作区区块（整块由 `ui-workspace` 接管） |
| `sidebar.settings` | single | 底部的设置入口 |
| `sidebar.footer.action` | list | 页脚操作行 |

**`ui-workspace` 在 `sidebar.workspaces` 内部另有子席位**，与 `sidebar` 无关，不要把它算进上面这张表：

```
sidebar.workspaces.directoryFlow          single
sidebar.session.row.leading               list
sidebar.session.row.trailing              list
sidebar.session.row.hover                 list
sidebar.workspaces.session.row.action     list
sidebar.workspaces.session.menu.item      list
```

> 早先版本的本文档还列过 13 个名字（会话区、文件树、右面板三类）。这些在 ui-sidebar、ui-workspace、ui-conversation 三个包的打包产物里**均无声明**，已全部删除。判断一个名字是否存在只认打包产物里的 children 声明块——不认文档、注释或记忆。

## 三、四种 kind 的行为差异

| kind | 语义 | 一处声明可挂几个 | 典型误用 |
|---|---|---|---|
| `single` | 单占用者，优先级高者胜 | 1 | 当 list 用，后注册的永远不显示 |
| `list` | 有序列表，全部渲染 | 多个 | 当 single 用，多个插件互相覆盖 |
| `keyed` | 按 key 索引，同 key 覆盖 | 每 key 1 个 | key 拼错时页面永不渲染且无报错 |
| `chain` | 责任链，可短路 | 多个 | —— |

**`keyed` 的静默失效**是本架构最容易踩的坑：两侧各自注册「成功」，key 字符串不一致则目标页面永远不渲染，且**没有任何报错**。

## 四、两列几何

本插件占住 `sidebar` 之后，把这一列切成两段：

```
                          ┌── RAIL_FIXED_WIDTH = 180 ──┬── navPx = 240 ──┐
展开                       │        产品轨               │    二级导航      │  合计 420
                          ├── RAIL_COLLAPSED_WIDTH = 56 ─┤                 │
产品轨收起                 │      图标轨                 │                 │  合计 296
                          └────────────────────────────┴─────────────────┘
```

| 常量 | 值 | 含义 |
|---|---|---|
| `RAIL_FIXED_WIDTH` | 180 | 产品轨展开宽度 |
| `RAIL_COLLAPSED_WIDTH` | 56 | 产品轨收起宽度（40 图标 + 两侧 8） |
| `navPx` | `SIDEBAR_MAX_WIDTH - RAIL_FIXED_WIDTH` = 240 | 二级导航宽度，**恒定量** |
| `SIDEBAR_MAX_WIDTH` | 420 | 整列上限，与 ui-layout 的 `SIDEBAR_MAX` 相同 |

**这三个数不与 `props.width` 联动。** `props.width` 是 ui-layout 对「本插件钉下的轨道」的回报，拿它反算产品轨宽度会形成循环依赖：收起钉 296 → 宿主回报 296 → 展开时仍按 296 推算，产品轨回不到 180、导航列被压到 100。同理 `useSoloTrack` 的 `widthFor` 不与 `hostWidth` 取 `Math.min`。

窄视口不由本插件兜底：ui-layout 在视口 <1024 时报 `collapsed`，<768 时把整列变成覆盖在内容上的抽屉。

## 五、ui-layout 的列宽模型

```ts
SIDEBAR_MIN = 264      SIDEBAR_MAX = 420      SIDEBAR_DEFAULT = 280
SIDEBAR_COLLAPSED = 56
SIDEBAR_AUTO_COLLAPSE = 1024        // 视口窄于此，sidebar 变 collapsed
SIDEBAR_DRAWER_BREAKPOINT = 768     // 视口窄于此，整列浮在内容上
CENTER_MIN = 400                    // 主内容区保底宽度
```

`computeColumns(viewport, sidebar, rightbar, collapsedWidth, centeredSidebar)` 返回三列宽度。要点：

- `sidebar` 偏好为 0 时取 `collapsedWidth`（56），否则 `clampWidth(sidebar, 264, 420)`。
- 右列只有在 `viewport - s - CENTER_MIN >= RIGHTBAR_MIN(300)` 时才占轨道，否则为 0。
- 主内容区的保底只在右列不占轨道时才允许跌破。

**默认 280 是初始值，不是设计值。** 本插件在启动时通过能力探测调用 ui-layout store 的 `setSidebar(420)` 把列拉满；`ILayout` 的公开面没有设置宽度的方法，`panels` 是 TS `private` 但运行时仍是普通属性。够不到就安静退回默认布局——宽度会窄，功能不受影响。

## 六、本插件声明的 20 个席位

占住 `sidebar` 时一次性声明，全部 `scope: 'root'`。

**补位：原生的 8 个**（kind 与原生逐一对齐，否则第三方插件注册时会因 kind 不符而失效）

```
sidebar.brand.mark          single      sidebar.panellist           list
sidebar.brand.name          single      sidebar.panellist.actions   list
sidebar.toggle.badge        single      sidebar.workspaces          single
sidebar.settings            single      sidebar.footer.action       list
```

**自建：12 个**

| 席位 | kind | 用途 |
|---|---|---|
| `sidebar.products` | list | 产品行收集槽。所有 `dsh-product-*` 注册到这里，组别由配置决定 |
| `sidebar.products.g-ai` | list | 旧分组槽，保留声明只为不破坏仍往这里注册的包 |
| `sidebar.products.g-pm` | list | 同上 |
| `sidebar.products.g-code` | list | 同上 |
| `sidebar.products.g-cicd` | list | 同上 |
| `sidebar.products.g-sec` | list | 同上 |
| `sidebar.products.g-platform` | list | 同上 |
| `sidebar.content` | keyed | 二级导航内容，按产品 id 索引 |
| `sidebar.columns` | list | **占住即声明要右列**；未声明不渲染 |
| `sidebar.columns.collapsed` | list | 右列收起态装饰 |
| `sidebar.columns.visible` | list | 右列展开态装饰 |
| `sidebar.rail.account` | list | 页脚账号行 |

**右列的显式声明规则**：`sidebar.columns` 注册即表示「要右列」，未注册则不渲染。不由外壳推断「有没有注册 `sidebar.content`」——「产品注册了」与「要显示右列」是两件独立的事。

## 七、第三方插件接入（两行）

```js
// 1. 产品行
ctx.slots.inject('sidebar.products', () =>
  ctx.slots.register({ name: 'sidebar.products', id: 'my-product', order: 10, label: '我的产品' }, Row))

// 2. 整页（key 必须与上面的 id 完全一致）
ctx.slots.inject('main', () =>
  ctx.slots.register({ name: 'main', key: 'my-product' }, Page))
```

**只需要这两处。** 注册选项里只有 `id` / `order` / `label` 会被读取，其余字段被丢弃。

要不要右列是第三处独立声明：往 `sidebar.columns` 注册一个渲染函数，不注册就没有右列。

## 八、媒体查询

本插件只用三条，全部与设备能力相关，不与视口宽度相关：

| 查询 | 作用 |
|---|---|
| `@media (hover: hover)` | 包裹全部 21 条 `:hover`。触屏无指针离开，裸 `:hover` 会粘连 |
| `@media (pointer: coarse)` | `.pn-name-input` 抬到 16px，避免 iOS Safari 聚焦缩放 |
| `@media (prefers-reduced-motion: reduce)` | 过渡与动画时长压到 0.01ms |

## 九、注入的客户端服务

只有三个：

```
@deepseek-ai/dsh-client-ui-slots      ctx.slots
@deepseek-ai/dsh-client-ui-layout     ctx.layout
@deepseek-ai/dsh-client-locale        ctx.locale
```

---

## 核实方法

本文每条断言都能复现。`dsh` 的打包产物在 `resources/app.asar` 内，可用 `@electron/asar` 提取后检索：

```bash
# 列出 sidebar 相关包
npx @electron/asar list <app.asar> | grep ui-sidebar

# 提取原生 sidebar 的打包产物
npx @electron/asar extract-file <app.asar> \
  "dsh\node_modules\@deepseek-ai\dsh-client-ui-sidebar\lib\client.js"

# 列出它声明的全部子席位（权威清单）
grep -o '[a-z.]*sidebar\.[a-z.]*":{kind:`[a-z]*`' client.js
```

**判断一个席位名是否存在，只认打包产物里的 `children` 声明块**，不认文档、注释或记忆。写本文档时正是从旧版删掉了 13 个查无实据的名字。
