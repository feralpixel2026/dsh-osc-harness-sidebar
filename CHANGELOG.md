# Changelog

本文件记录所有值得注意的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-11-13

导航配置页的显示、展开、拖拽分组、组内排序四项交互全部重做，修掉一类「看起来没反应、实际是静默失效」的缺陷；另做三项性能优化，切换页面不再有停顿感。

### 修复

**拖拽**

- **跨相邻分组拖不进去、跨多个分组却能进去**：`onDragOver` 用异步 `useState` 判断拖动状态。React 下一个 tick 才提交，首个 `dragover` 读到 `null` 就提前返回，**没有调用 `preventDefault`**，浏览器因此不认为该元素是可落点，随后的 `drop` 完全不触发。指针跨过若干元素后状态已刷新，于是「跨得远反而可以」。全部拖放守卫改读同步 ref。
- **进入分组后出不来**：四个落点里空组占位与组行空白走 `moveProduct`（改归属），标签与尾部落点只走 `reorderProduct`（只改次序）。落在标签上就永远只换位、不改归属。四处落点统一为「先改归属、再排位」。
- **拖到紧邻的下一行不动**：`reorder(from, to)` 缺一个维度。删除 `from` 后 `to` 会左移一格，「占据 `to` 的位置」在相邻行上正好还原成原位。改为 `reorder(from, to, side)`，显式传入 `before` / `after`。
- **拖到别组要拖两次**：`items` 是本次渲染的分组切片，从别组拖来的行不在其中；排序按「不含这一行」的列表算，位置对不上所见。两处落点先把被拖行补进列表再排位。
- **「更多」的位置总是不对**：`resolveGrouping` 把不在 `productOrder` 里的 id 当作 `MAX_SAFE_INTEGER`，即永远排末尾。而任何一次写入只要漏行，那一行就沉底。「更多」的注册 `order` 同样是 `MAX_SAFE_INTEGER`，两个「最后」叠加，它的位置完全取决于是否在列表中。新增 `fullOrder()`，每次写入都以完整清单为基准，`moveProduct` 也顺带补全顺序。
- **拖到标签上必抛异常**：`chipList` 定义在 `row` 之前，作用域里没有 `section`，一处 `moveProduct(dragging, section.id)` 每次必抛 `ReferenceError`，在清理拖动状态之前中断——表现为「移动不进去」「高亮残留」「排序错乱」。改走 `onDropInto` 回调。
- **拖拽高亮残留**：组行 `onDragOver` 的守卫读异步状态，首帧不生效；`onDragLeave` 用 `relatedTarget` 判断，而拖动过程中它通常是 `null`，清理被跳过；进入标签或尾部时也没有人清掉行级高亮。三处一并修正。

**分组与显示**

- **隐藏分组后「分组显示」开关看着没反应**：此前把隐藏分组的产品改挂到默认分组继续显示，行还在、只换了标题。改为整组不渲染。
- **恢复默认后新建的分组还在**：重置把新值**合并**到旧配置，`customSections`、`sectionLabels`、`sectionOrder`、`productGroups`、`productOrder` 全部被继承。改为写入完整出厂状态，未列出的键即不存在。
- **空分组接不住拖来的行**：空状态只渲染一行说明，没有任何落点。空占位现在也处理 `dragover` / `drop`。
- **默认分组的显示与展开开关**：它没有标题行，两个开关都没有可见效果。固定为始终显示、始终展开并禁用开关（悬停说明原因），读取配置时清掉旧数据里对它的隐藏/收起记录。它是所有无归属行的落点，注册不规范的子产品也落到这里。
- **标签上的三个动作互相干扰**：标签是 `<label>` 包着自己的 `<input type="checkbox">`，HTML 规定点击 label 任意位置都会激活控件，于是拖动、选中、切换显隐共用同一热区。容器改为 `<div>`，复选框自行隔离点击与拖动起点，并补回被一并删掉的 `draggable`。

**状态**

- **`openSections` 有三份状态**：配置页一份 `useState`、轨道一份 `useState`、持久化一份，且两份副本的出厂值不同（`['g-ai']` 与 `DEFAULT_OPEN_SECTIONS`）。删除两份副本，读写统一走 `isSectionOpen` 与 `writeNavConfig`。

### 性能

- `getNavConfigSnapshot` 不再每次渲染读 `localStorage`。它是 `useSyncExternalStore` 的 `getSnapshot`，每次渲染及提交后都会被调用，而 `localStorage` 是同步阻塞 API。改为由 `writeNavConfig` 同步更新内存快照（先更新再通知，否则订阅者读到旧对象会跳过渲染）。
- 换页包进 `startTransition`：选中态先提交、高亮立即出现，目标页面在后台渲染。总耗时不变，点击不再像没反应。
- 分组行改为一次建索引（`rowsBySection`），取代每个分组各扫一遍全表再线性查隐藏列表的 O(分组 × 行数)。

### 测试

- 新增 `test/navigation.test.mjs`，覆盖展开状态单一来源、隐藏分组不渲染、默认分组恒显示且恒展开、空组接收拖放、四个落点都能改归属、`reorder` 的相邻行用例、`productOrder` 完整性、拖放守卫一律读 ref、拖放处理器不得引用越界标识符、`chipList` 作用域、索引声明顺序等不变量。用例从 27 增至 47。
- 保留四个独立模拟器（`tools/_sim-*.mjs`），把真实函数体提取出来跑用例。它们两次证伪了仅通过语法检查与静态断言的修法。

### 移除

- 删除 `.github/workflows/publish.yml`。发布经本地 `npm publish` 完成，仓库内不再保留会自动触发发布的流水线。

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
