# Changelog

本文件记录所有值得注意的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.8] - 2026-11-13

macOS 窗口顶带适配（hiddenInset 红绿灯），并修复 AI Harness 分组默认收起。

### 新增

- macOS 顶带对齐红绿灯：产品轨与导航列各让出 52px 顶部条，内容从 y=52 起画。红绿灯横跨 x 16–68，此前导航列第一行被它压住。
- 窗口顶带的折叠与新会话控件：展开态在列内，整列隐藏时交给框架的 `shell.leading` 座（定位在 (88, 11)，与原生 `.leadingSeat` 同量法）。收起后左上角不再空白。

### 修复

- **AI Harness 分组首次安装不展开**：`isSectionOpen` 只给 `g-default` 开了「未配置即展开」的特例，其他分组一律返回 false——写进 `openSections` 也只在配置存过之后才生效。改为读 `DEFAULT_OPEN_SECTIONS = ['g-default', 'g-ai']`，初始值、恢复默认、渲染判定三处共用这一份。
- **收起态两个顶带按钮无 hover**：原先 `position: fixed` 钉在视口 (88, 12) / (124, 12)。整列收到 0px 后 `.sidebarCol` 的 `overflow: hidden` 把按钮裁掉；产品轨收成 56px 时又落到列外。整列隐藏改由 `shell.leading` 座接管（列外挂载，不被裁剪），产品轨收起态的定位一并修正。
- **新会话按钮点了没反应**：`startSession` 经 `ctx.get('uiWorkspace')` 取服务，但 `uiWorkspace` 未列入 `inject`。`ctx.get` 不等兄弟插件就绪，apply 先跑完时返回 `undefined`，调用静默失败。补进 `inject` 后 Cordis 会等服务就绪再执行。
- **折叠产品轨时图标闪到右上角**：`.pn-rail` 的 `transition` 含 `padding`，而 macOS 收起态的让位就是一个 52px 上内边距切换。它与 `flex-basis` 同时跑 200ms 线性插值，节奏不同步，图标中途被挤出轨道、动画结束又弹回。padding 退出过渡，只过渡宽度。
- **红绿灯页的接缝线**：`.pn-rail` 的 `border-right` 画满整列高度，穿过红绿灯那一行。原生在 darwin 下清掉这条边框（该列底是 vibrancy 玻璃，半透明底上压实线读起来像划痕），这里同样移除。
- **全屏时控件悬空**：全屏隐藏红绿灯后，顶带控件仍留在 x=88/124。按原生 `[data-fullscreen] .leadingSeat { left: 12px }` 左移，新会话钮跟着移到 x=48。
- 收起态轨道 56px 装不下横跨 52px 的红绿灯，顶部条改为内边距让位（内联声明，样式表规则会被 shorthand 重置）。


## [0.3.5] - 2026-11-12

产品轨与原生侧栏对齐，两列宽度定案；补齐触屏与无障碍。

### 新增

- 产品轨可收成一列图标：点 logo 行在 180px 与 56px 之间切换，状态记入 `localStorage`。这是产品轨自己的折叠轴，与 ui-layout 的整列折叠互不覆盖。
- 产品轨默认分组末尾的「更多」：**创建你的插件** / **浏览插件**。前者开一个 cordis 会话并预置引导语，让 agent 先找到安装目录、读 README 的接入说明再动手，末尾留产品名称、id、页面内容三个空位。不写死路径（`link:` 与 npm 安装的包目录不同），也不在提示词里内嵌协议（会与 README 漂移）。
- 右列面板列表末尾的「更多」，还原原生 `ui-sidebar` 的位置（面板行之后、`</nav>` 之前），行来自 `sidebar.panellist.actions` 席位。
- 两处菜单的图标取自 `@deepseek-ai/dsh-client-ui-primitives`（16 单元坐标系、1px 描边）；弹层用 `position: fixed` 而非 portal——`.pn-nav` 与 `.pn-rail` 都是 `overflow: hidden`，绝对定位会被裁掉。同时补齐 Esc 关闭、点外关闭、方向键漫游、滚动即关。
- `sidebar.panellist.actions` 终于有出口：该席位一直声明着、`ui-entry-customization` 也一直往里注册，此前没有渲染点。
- 品牌标兜底：`sidebar.brand.mark` 未注册时画鱼形标，此前品牌行会空一截。
- `sidebar.columns.collapsed` 席位：注册即强制收起，优先级最高。
- 主内容区套 `.pn-content-frame`（`container-type: inline-size`），产品按这一列宽度降列而非按视口。
- 文档：[`docs/integration.md`](docs/integration.md) 四条硬性要求、[`docs/dshell-ui-architecture.md`](docs/dshell-ui-architecture.md) 席位与几何实测记录。

### 修复

**几何与选中态**

- 折叠产品轨再展开后第二列被压窄、点 logo 看不出变化：三个宽度都曾与宿主回报的列宽联动。`props.width` 是 ui-layout 对「本壳钉下的轨道」的回报，拿它反算会形成循环——收起钉 296 → 宿主回报 296 → 展开时按 296 推算，产品轨回不到 180、导航列只剩 100。改为三处纯常量：`railPx` 展开 180 / 收起 56，`navPx` 恒为 240，`useSoloTrack` 的 `widthFor` 不与 `hostWidth` 比较。
- 打开右侧面板后产品轨右侧出现空白带：壳在挂载时整体替换 `grid-template-columns`，而 `AppFrame` 每次布局变化都会重写它。改为只替换第一条轨道，并用 `MutationObserver` 在每次重写后重新钉住。
- 点 FPGA / GJB 5000B 等行时文字变粗并轻微位移：选中态里有一条 `font-weight: 500 !important`，而未选中的行是 400。字重变化会改变字形宽度。原生 `.panelRow` 的选中态只动 `background-color` 与 `color`，字重是排版属性、不是状态通道。
- 选中大肥鱼后没有选中底色：`selectRail` 把会话行排除在选中记录之外。该排除是为旧版单一 `activeId` 写的，拆出独立轨道选中态后只剩副作用。
- 点第二列面板行会让产品轨高亮消失：产品行与面板行共用同一个「当前项」。两者已分开，可以同时高亮。
- 导航行文字是次级灰、悬停才变黑，「更多」菜单看起来像禁用态：原生 `.panelRow` 静置即主色。三处导航行改回主色。
- 悬停产品行文字不变色、点击后才变：产品行内联 `color` 压过了 `:hover` 规则。内联色已移除。

**分组与配置**

- 轨道分组点不开：`toggleSection` 只更新组件状态，渲染却读 `readNavConfig()`。
- 点分组后隐藏分组重新出现：写回时用了渲染期快照，丢掉了 `hiddenSections`。
- 勾选任意分组导致默认分组收起：`openSectionsTouched` 被无条件写入，而 `isSectionOpen` 只在默认分组上读它。

**生命周期**

- 关闭插件后原生侧栏空白：profile 补丁的 `ui-sidebar: disabled` 与 bundle 补丁的原子恢复冲突。
- 关闭插件后界面残留半损坏的列：槽位机制会保留已挂载的组件树，直到下次渲染才抛 `StaleAuthorizationError`。新增席位代次守卫——disposer 先递增代次让残留树渲染 `null`，再拆注册。
- 插件停用后访问 `ctx.<service>` 抛 `inactive context`：服务改为在 `apply` 时取一次，闭包只引用本地绑定。

**触屏与无障碍**

- 触屏上点过的行一直保持高亮：21 条 `:hover` 没有媒体查询保护。触屏没有「指针离开」，裸 `:hover` 会粘连。全部逐条包进 `@media (hover: hover)`。
- 未响应系统「减少动态效果」：新增 `@media (prefers-reduced-motion: reduce)`，把时长压到 0.01ms。清的是时长而非属性，布局与配色仍立即生效。
- 触屏上聚焦改名输入框会整页放大：iOS Safari 聚焦 font-size < 16px 的输入框时放大整页且失焦不还原。新增 `@media (pointer: coarse)` 下 16px 下限，精确指针保留 13px。

### 兼容

- 记住曾注册过 `sidebar.columns` 的 id，这些 id 不声明 `visible` 也继续占列，升级不会让已在工作的二级导航消失。

### 需要动作

新写的产品插件必须注册 `sidebar.columns.visible`，否则看不到二级导航列。

## [0.3.2] - 2026-11-10

### 修复

- 会话行与工作区列表的滚动、以及若干配置项的持久化问题。

## [0.3.1] - 2026-11-10

### 修复

- 产品轨的行高、图标与文案对齐原生侧栏。

## [0.3.0] - 2026-11-10

首个公开版本：接管 `sidebar` 席位，产品轨 + 二级导航两列结构。

---

## 设计决定

以下取舍有反例支撑，改动前先看这里。

- **两列宽度是常量，不参与协商。** 180 + 240 = 420 是设计值。曾经三次尝试让宽度「自适应宿主给的列宽」，每次都因为 `props.width` 本身就是我们钉下的轨道而回报出循环依赖，表现为折叠后展开异常、logo 点击无可见变化。列宽不够是宿主那一侧的事，由 `setSidebar` 负责拉开，不该由内容去将就。
- **选中态只改背景与文字色。** 字重、字号、字距都是排版属性，改变它们会让被选中的行比相邻行粗一档并左右抖动。
- **右列是否显示由插件显式声明。** 「注册了产品」与「要显示右列」是两件独立的事，不由外壳推断。
- **跨插件协作的唯一契约是席位名与 key 字符串。** 两侧各自「成功」，key 不一致则页面永不渲染且没有任何报错——属第三型静默失效。
- **不接管 `root` 席位。** 本包只换左列，主内容区与整体框架仍是原生的。这也是它叫「外壳底座」而不是「内核」的原因。
