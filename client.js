/**
 * OSC Harness Sidebar for DSH：接管 `sidebar` 席位，把这一列一分为二。
 *
 *     [ 产品导航轨 180/56 ][ 当前产品自己的导航 ]
 *
 * 这是一个**壳**，不含任何产品知识：它只画品牌行、分组骨架和折叠行为。产品行由
 * 各产品插件包（以及本壳的内置行）注册进**同一个**收集槽 `sidebar.products`，页面
 * 由各自的包注册进 `main`。
 *
 * 分组不靠槽位表达：注册项里拿不到自定义字段，所以壳按配置把行归组，配置页可拖动
 * 排序、改名、增删分组、把产品拖到别的分组，结果存 localStorage 并即时生效。
 *
 * 只占 `sidebar`，框架（`root` / `main` / `rightbar` / `ctx.layout`）仍归
 * ui-layout，所以这里出故障最多是左列空白，不会白屏。
 *
 * 三个踩过的坑，改这个文件前先读：
 *   1. 针对子席位的注册必须写在 `inject('sidebar')` 回调**内部**。热启用时
 *      apply 先跑、声明还没落地，写在 apply 顶层会抛错并中断 apply，表现
 *      为左列空白、重启才好。
 *   2. 子席位只能由**声明它的那个组件**渲染。把 DSH 的导航注册进
 *      `sidebar.content` 会因未授权渲染子席位而抛错，条目随即被 ui-slots
 *      abdicate（inspect 显示 active: false），右列整块消失。
 *   3. 注册选项只保留 key/id/order/label/priority，自定义字段会被丢弃。所以产品
 *      不能在注册时说明自己属于哪一组——归组信息只能来自壳里的默认表与用户配置。
 */


window.__ModuleLoader__.load({
  id: 'dsh-osc-harness-sidebar',
  factory(require) {
    const NS = 'productNav'

    /**
     * 产品导航的固定宽度（px）。不随 ui-layout 的列宽变化，也不可拖动——按预算
     * 缩放会在默认 280 下把它压到 95px，产品列表就缩成一行图标了。
     */
    const RAIL_FIXED_WIDTH = 180

    /**
     * 收起态产品导航宽度（px）。
     *
     * 参考原型是 64，但那条轨展开时 240px；这里展开只有 180、图标 18px，
     * 56 正好是 40px 点击区加两侧各 8px 留白，比 64 更紧凑。
     */
    const RAIL_COLLAPSED_WIDTH = 56
    /** ui-layout 的 SIDEBAR_MAX：整列宽度的硬上限（px）。 */
    const SIDEBAR_MAX_WIDTH = 420

    /** 保留 id：选中它回到 DSH 会话界面，而不是某个 main 页面。 */
    const CONVERSATION_ID = 'product-conversation'

    /** 产品轨默认分组末尾的「更多」行 id。`__` 前缀与插件 id 的命名空间隔开。 */
    const MORE_ROW_ID = '__rail-more__'

    /**
     * 本包自己画的行。其余所有行都来自 `dsh-product-*` 插件。
     *
     * 「恢复默认」按这份名单还原可见性：装上本壳时该看到的就是这两行，
     * 而不是已安装插件的清单。
     */
    // 本壳自带的行：恢复默认时保持显示（出厂状态），但用户可以像对待插件行一样把它们关掉。
    //   product-conversation（大肥鱼 DSH）  回原生会话的入口；关掉后仍可用 logo 行切换
    //   __rail-more__（更多）               创建插件的入口；关掉后仍可从页脚「插件管理」进入
    const BUILT_IN_ROW_IDS = [CONVERSATION_ID, MORE_ROW_ID]
    /**
     * 席位活性代次。
     *
     * 插件停用后，槽位机制会**保留**已挂载的组件树，直到它下次渲染才抛
     * `StaleAuthorizationError`（`ui-slots/src/renderer.ts:278`）。这解释了「开启正常、
     * 关闭不撤」：开启是新挂载，落在活注册上；关闭是活注册被销毁，而树已经挂着，
     * 没人逼它重渲染，它就继续用一份已被拆掉的样式表与字典画下去。
     *
     * 壳没法让框架提前卸载，但能让自己的组件停止出画：disposer 递增这个代次，
     * 组件在挂载时记住自己那一代，发现过期就渲染 `null`。React 会在框架下一次渲染
     * 时执行到它——正是原本要抛错的那一次——于是整列消失而不是降级。
     */
    let seatGeneration = 0
    const seatGenerationListeners = new Set()

    /**
     * 让所有已挂载的席位实例重新读取代次。
     *
     * 只由 disposer 调用；重渲染的驱动是代次变化本身，所以订阅端是空实现。
     * @returns 无。
     */
    function bumpSeatGeneration() {
      seatGeneration += 1
      for (const listener of seatGenerationListeners) listener()
    }

    /** 产品轨自带折叠态的存储键。与 DSH 的整列折叠无关，两者互不覆盖。 */
    const RAIL_COLLAPSED_KEY = 'dsh.productNav.railCollapsed'

    const en = {
      'rail.label': 'Products',
      'rail.add': 'Plugin manager',
      'rail.collapse': 'Collapse product rail',
      'rail.collapseColumn': 'Collapse sidebar',
      'rail.expandColumn': 'Expand sidebar',
      'rail.expand': 'Expand product rail',
      'nav.newSession': 'New session',
      'nav.panels': 'Global panels',
      'more.label': 'More',
      'more.createProduct': 'Create your plugin',
      'more.browseProducts': 'Browse plugins',
      'more.createProductPrompt': [
        'Add a product plugin to the left product navigation.',
        '',
        'The shell hosting that navigation is the dsh-osc-harness-sidebar plugin. Find its install',
        'directory first, then read the section "Writing a plugin for this rail" in its README and',
        'follow that protocol. If the README is not there, use the standard DSH client-plugin form.',
        '',
        'Product name:',
        'Product id:',
        'What the page should show:',
      ].join('\n'),
      'brand.fallback': 'OSC Harness Sidebar',
      'brand.wordmark': 'OSCHINA',
      'brand.tag': 'Harness',
      'dsh': 'Big Fat Fish DSH',
      'section.ai': 'AI Harness',
      'section.pm': 'Collaboration domain',
      'section.code': 'Development domain',
      'section.cicd': 'CI / CD domain',
      'section.sec': 'Security domain',
      'section.platform': 'Platform domain',
      'rail.configure': 'Navigation settings',
      'config.title': 'Navigation settings',
      'config.subtitle': 'Show, rename, reorder and group the product navigation. Changes apply immediately and persist across reloads.',
      'config.defaultGroup': 'Default group',
      'config.rename': 'Group name',
      'config.renameHint': 'Double-click to rename',
      'config.cannotRename': 'The default group cannot be renamed.',
      'config.open': 'Expanded',
      'config.visible': 'Shown',
      'config.hidden': 'Hidden',
      'config.reset': 'Reset',
      'config.add': 'New group',
      'config.remove': 'Delete',
      'config.removeConfirm': 'Products in this group move to the first group. Continue?',
      'config.dragHint': 'Drag ⠿ to reorder groups. Drag a row onto another row to reorder it, or onto another group to move it.',
      'config.unnamed': 'New group',
      'config.viewProducts': 'Show products in this group',
      'config.countHidden': 'hidden',
      'config.chipHint': 'Drag within the group to reorder, onto another group to move',

      'config.openProducts': 'Expanded',
      'config.noProducts': 'No navigation rows in this group yet.',
      'config.colName': 'Navigation group',
      'config.colCount': 'Navigation rows',
      'config.colVisible': 'Group shown',
      'config.defaultAlwaysShown': 'The default group holds every ungrouped row, so it is always shown',
      'config.colOpen': 'Group expanded',
      'config.colActions': 'Actions',
      'config.summary': 'Groups',
      'config.summaryProducts': 'Products',
    }

    const zh = {
      'rail.label': '产品导航',
      'rail.add': '插件管理',
      'rail.collapse': '收起产品轨',
      'rail.collapseColumn': '收起侧栏',
      'rail.expandColumn': '展开侧栏',
      'rail.expand': '展开产品轨',
      'nav.newSession': '新会话',
      'nav.panels': '全局面板',
      'more.label': '更多',
      'more.createProduct': '创建你的插件',
      'more.browseProducts': '浏览插件',
      'more.createProductPrompt': [
        '给左侧产品导航加一个产品插件。',
        '',
        '承载它的外壳是 dsh-osc-harness-sidebar 插件。先找到它的安装目录，读 README 里',
        '「写一个插件接入这个导航」一节，按那里的协议实现；如果找不到 README，就按 DSH 标准',
        '客户端插件形态做。',
        '',
        '产品名称：',
        '产品 id：',
        '页面要展示什么：',
      ].join('\n'),
      'brand.fallback': 'OSC Harness Sidebar',
      'brand.wordmark': 'OSCHINA',
      'brand.tag': 'Harness',
      'dsh': '大肥鱼 DSH',
      'section.ai': 'AI Harness',
      'section.pm': '协同域',
      'section.code': '开发域',
      'section.cicd': '持续集成/交付域',
      'section.sec': '安全域',
      'section.platform': '平台域',
      'rail.configure': '导航配置',
      'config.title': '导航配置',
      'config.subtitle': '显示、改名、排序与分组产品导航。改动立即生效，刷新后保留。',
      'config.defaultGroup': '默认分组',
      'config.rename': '分组名称',
      'config.renameHint': '双击可改名',
      'config.cannotRename': '默认分组不可改名。',
      'config.open': '展开',
      'config.visible': '显示',
      'config.hidden': '隐藏',
      'config.reset': '恢复默认',
      'config.add': '新建分组',
      'config.remove': '删除',
      'config.removeConfirm': '该分组里的产品会移到第一个分组。继续？',
      'config.dragHint': '拖 ⠿ 调整分组顺序。拖产品到同组另一行可换位，拖到别的分组可改归属。',
      'config.unnamed': '新分组',
      'config.viewProducts': '查看该分组的产品',
      'config.countHidden': '已隐藏',
      'config.chipHint': '同组内拖动换位，拖到别的分组改归属',

      'config.openProducts': '展开',
      'config.noProducts': '该分组下还没有导航行。',
      'config.colName': '导航分组',
      'config.colCount': '产品导航',
      'config.colVisible': '分组显示',
      'config.defaultAlwaysShown': '默认分组是所有未归组行的落点，固定显示',
      'config.colOpen': '分组展开/折叠',
      'config.colActions': '操作',
      'config.summary': '分组',
      'config.summaryProducts': '产品',
    }

    const STYLES = `
    /*
     * shell.leading 座里的两个按钮。座由框架定位在 (88, 11) 且已设 no-drag，
     * 这里只负责盒子：红绿灯止于 x 68 → 20px 空档 → 28px → 8px → 28px，
     * 与原生 .leadingSeat 同量法。
     */
    .pn-leading { display: flex; align-items: center; gap: 8px; }
    .pn-leading-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; margin: 0; padding: 0;
      border: none; border-radius: var(--dsw-radius-sm, 6px);
      background: transparent; color: var(--dsw-alias-label-secondary);
      cursor: pointer; outline: none;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }
    @media (hover: hover) {
    .pn-leading-btn:hover {
      background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary);
    }
    }
    .pn-leading-btn:focus-visible {
      box-shadow: 0 0 0 var(--dsw-focus-ring-width, 2px) var(--dsw-focus-ring-color, currentColor);
    }
    .pn-shell { display: flex; height: 100%; min-height: 0; background: var(--dsw-specific-sidebar-fill); }
    /*
     * macOS hiddenInset 标题栏：红绿灯落在窗口 (16, 18)，横跨 x 16–68。
     *
     * 原生 ui-sidebar 用一条 52px 顶部条避开（SidebarRoot.module.css .topStrip），
     * 并让这条自己成为窗口拖拽区。本壳整列接管后必须自己补。
     *
     * 只在 html[data-platform='darwin'] 下出现：该属性由桌面 preload 设置，
     * 纯 Web 端拿不到，也就不白占 52px。
     */
    /*
     * macOS：去掉产品轨的右边框。
     *
     * 这条线画满整列高度，于是会从 y=0 一路穿过红绿灯那一行（y 18–30），
     * 看起来像一条穿过窗口控制区的接缝。
     *
     * 原生也是这么处理的：ui-layout 给 .sidebarCol 设了这条边框，但随后在
     * [data-platform='darwin'] 下清成 none——那边列底是窗口的 vibrancy 玻璃，
     * 半透明底上压一条 0.5px 实线读起来是划痕，不是分隔。
     *
     * 两列在 darwin 下靠背景色差分层（轨道 var(--dsw-specific-sidebar-fill)，
     * 导航列同底），去掉边框仍然分得开。
     */
    html[data-platform='darwin'] .pn-rail { border-right: none; }

    .pn-titlebar-strip { display: none; }
    html[data-platform='darwin'] .pn-titlebar-strip {
      display: block; flex: none; height: 52px; box-sizing: border-box;
      /* 与原生 .topStrip 同一条：负上边距吃掉列的 6px 内边距，贴住窗口顶边。 */
      margin: -6px calc(-1 * var(--dsh-sidebar-inline-padding, 8px)) 0;
      -webkit-app-region: drag;
    }
    /* 收起态的产品轨没有 6px 上内边距（padding: 8px 0 6px），去掉这段抵消。 */
    html[data-platform='darwin'] .pn-rail[data-collapsed] .pn-titlebar-strip { margin: 0; }

    /*
     * 内容上提 -12px：原生 .topStrip + .logoRow { margin-top: -12px }，让品牌行
     * 落在顶部条下沿之上 12px。两列同时提，横向才齐平。
     */
    html[data-platform='darwin'] .pn-rail .pn-rail-brand { margin-top: -12px; }
    html[data-platform='darwin'] .pn-nav > .pn-logo-row { margin-top: -12px; }

    /*
     * 收起态（56px 图标轨）：轨道比红绿灯窄（68px），顶部条装不下三个灯，
     * 所以收起时不画条，改成给轨道顶部留出红绿灯的高度，图标从 y=52 起排。
     *
     * 原生在 darwin 下直接隐藏整列，没有这个问题；本壳保留图标轨，
     * 就必须自己让位，否则收起后第一个图标点不到。
     */
    /*
     * 收起轨的红绿灯让位由 JSX 内联 padding 承担（内联压过样式表，写成 CSS 规则
     * 会被 shorthand 重置——第一次修复就是这么失效的）。这里只保留「收起态不画
     * 顶部条」：轨道 56px 装不下 x 16–68 的三个灯，画了也盖不住。
     */
    html[data-platform='darwin'] .pn-rail[data-collapsed] .pn-titlebar-strip { display: none; }

    /* 产品导航宽度固定，右列吃剩余空间；两列之间没有可拖的把手。 */
    .pn-rail {
      display: flex; flex-direction: column;
      flex: 0 0 ${RAIL_FIXED_WIDTH}px;
      width: ${RAIL_FIXED_WIDTH}px;
      box-sizing: border-box;
      padding: 8px 8px 6px; border-right: 0.5px solid var(--dsw-alias-border-l3);
      background: var(--dsw-specific-sidebar-fill);
      overflow: hidden;
      /*
       * 只过渡宽度。padding 不参与动画：macOS 收起态的红绿灯让位是一个 52px 的
       * 上内边距切换，若它和 flex-basis 一起跑 200ms 线性插值，两条曲线的收窄
       * 节奏不同步——图标会在过渡中途被挤出轨道、动画结束再弹回去，读起来就是
       * 「先往右上角跑了一下」。
       */
      transition: flex-basis .2s linear, width .2s linear;
    }
    .pn-rail[data-collapsed] {
      flex: 0 0 ${RAIL_COLLAPSED_WIDTH}px; width: ${RAIL_COLLAPSED_WIDTH}px;
      padding: 8px 0 6px; align-items: center;
    }
    /* 收起态：整行让位给居中图标。展开态的 .pn-item 是 width:100%，
       不重置就会把图标推到左边缘。 */

    /*
     * 收起态的宽度固定 40：.pn-rail 在这一态把子元素居中，40px 的方块落在 56px 轨道的正中。
     * position: relative 是给品牌行里那个绝对定位的小角标留参照系。
     */
    .pn-rail[data-collapsed] .pn-rail-brand {
      justify-content: center; padding: 0; gap: 0; width: 40px;
      position: relative;
    }
    /* 角标压在标记右上角，与原生收起态展开按钮上的位置同义。 */
    .pn-rail-badge {
      position: absolute; top: 1px; right: 1px;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    /* 无 180px 的宽度预算可花，标签一律隐去，含义交给 title。 */
    .pn-rail[data-collapsed] .pn-rail-brand-tag,
    .pn-rail[data-collapsed] .pn-rail-brand-name { display: none; }
    .pn-rail[data-collapsed] .pn-rail-foot { align-items: center; width: 100%; }
    .pn-rail[data-collapsed] .pn-foot-button { justify-content: center; width: 40px; padding: 6px 0; }
    .pn-rail-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
    .pn-rail-scroll::-webkit-scrollbar { display: none; }
    .pn-rail-gap { flex: 1 1 auto; min-height: 8px; }

    /* 品牌行：高 48，与原型 logo 行同口径（左侧留白 8 + inner padding 8）。 */
    /* 品牌行横向预算（轨道 180）：容器左右各留 2px，间距 5px。
       2+2+20(标记)+5+OSCHINA+5+HARNESS ≈ 164 的内容宽里给字标 ~127px，
       比原先的 ~120px 宽出 7px——macOS 的字体度量比 Windows 宽，原先
       12px 按 Windows 量着刚好装下，到 macOS 就被 ellipsis 截成 "OSCHI…"。 */
    /* 与 .pn-item 同一套内边距：产品行是 0 8px，这里也随之对齐，
       否则 logo 距左边 2px、产品行距左边 8px，两块左边缘错开。 */
    .pn-rail-brand {
      display: flex; align-items: center; gap: 5px; flex: 0 0 auto;
      width: 100%; height: 48px; padding: 0 8px;
      border: none; border-radius: 8px; background: transparent;
      font: inherit; text-align: left; cursor: pointer;
      overflow: hidden; white-space: nowrap;
    }
    /* 只保留 hover 反馈，不作为常驻底色：下方每一行都是平的，
       一个常驻填充块会读成「已选中」而不是「可点击」。 */
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-rail-brand:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-interactive-bg-hover)) !important; }
    }
    .pn-rail-brand:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
    .pn-rail-brand-mark { display: inline-flex; flex: 0 0 auto; }
    /* 字标 12px：产品轨只有 180px，右侧原生品牌用的是 18px 但那边有 280px。
       弹性分配：字标可收缩、标签固定，所以先压字标——它一旦装不下就被
       ellipsis 截成 "OSCHI…"，比标签被截更伤识别。容器已把横向留白压到
       最小（见 .pn-rail-brand 的预算注释），跨平台字体度量差异下有富余。 */
    .pn-rail-brand-name {
      overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-weight: 700;
      color: var(--dsw-alias-label-primary); letter-spacing: 0.2px;
      flex: 0 1 auto; min-width: 0;
    }
    /* HARNESS 标签：照右侧原生品牌的做法——实心圆角块 + 反色文字，
       高度 14、圆角 2、字号 8.5。填充而不是描边，因为它和字标同属标识本身。
       letter-spacing 由 0.4 收到 0.2：五个字母的标签在 164px 一行里每 0.1px
       都很贵，而 0.2 在小字号上视觉差异不可辨。 */
    .pn-rail-brand-tag {
      flex: 0 0 auto; padding: 0 3px;
      border-radius: 2px; height: 14px; line-height: 14px;
      background: var(--dsw-alias-label-primary);
      color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base));
      font-size: 8.5px; font-weight: 700;
      letter-spacing: 0.2px; text-transform: uppercase;
      white-space: nowrap;
    }
    /* 折叠态只留标志：标签在 56px 宽里会被截成半个词，比不显示更差。 */
    .pn-rail[data-collapsed] .pn-rail-brand-tag { display: none; }

    .pn-group { margin: 0; }

       10px 上边距用来隔开「上一组的产品行」，但第一个分组上方是品牌行——
       品牌行自己已有 margin-bottom，两个间距叠起来会让首组标题离 logo 偏远。
       首组收到 2px，与品牌行的 4px 合成一处刻意的间距。 */
    .pn-group[data-first] .pn-group-label { margin-top: 2px; }
    .pn-group-label {
      display: flex; align-items: center; gap: 8px; width: 100%; height: 30px;
      margin: 10px 0 2px; padding: 0 8px;
      border: none; border-radius: 8px; background: transparent;
      color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px; font-weight: 500;
      cursor: pointer; text-align: left; user-select: none;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-group-label:hover { background: var(--dsw-alias-interactive-bg-hover); }
    }
    .pn-group-arrow { display: inline-flex; flex: 0 0 auto; transition: transform .2s cubic-bezier(.42,0,.58,1); transform: rotate(-90deg); }
    .pn-group[data-open] .pn-group-arrow { transform: rotate(0deg); }

    /* 导航行：高 32、13px、圆角 8、下间距 2，与原型 NAV_ROW_STYLE 一致。 */
    .pn-item {
      display: flex; align-items: center; gap: 8px; width: 100%; height: 32px;
      margin-bottom: 2px; padding: 0 8px;
      border: none; border-radius: 8px; background: transparent;
      /* 静置即主色。原生 .panelRow 同样用 label-primary，hover 只改背景。 */
      color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
      cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden;
    }
    /* !important 在这里是必需的，不是随手加的：每一行都带内联 background: transparent，
       那是防产品插件越界改色的基线；而内联声明优先于任何选择器，不加就永远不会 hover。
       只对这两条状态规则用它，静态基线仍然是内联，插件选择器照样赢不了。 */
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-item:hover {
      background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-interactive-bg-hover)) !important;
      color: var(--dsw-alias-label-primary);
    }
    }
    .pn-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
    /* 两条都要 !important：行的内联样式同时写了 background 与 color，
       只给 background 加的话，选中行底色变了、字色还是次级——看起来像没选中。

       选中态**只改底色和文字色，不改字重**。原先这里还有一条 font-weight: 500，
       它让选中的行比相邻行粗一档、字宽也跟着变，点 FPGA / GJB 5000B 这类行时整列看起来
       在跳。原生的 .panelRow 选中时同样只动 background-color 与 color（SidebarRoot.module.css
       的 :706-708 与 :722-724），字重是排版属性，不是状态通道。 */
    .pn-item[data-active] {
      background: var(--dsw-alias-interactive-bg-hover, var(--dsw-specific-sidebar-nav-item-active)) !important;
      color: var(--dsw-alias-label-primary) !important;
    }
    /* 选中的行里，图标跟着主文字色走，否则图标仍是次级色。 */
    .pn-item[data-active] .pn-item-glyph { color: var(--dsw-alias-label-primary); }
    .pn-item-glyph { display: inline-flex; flex: 0 0 auto; font-size: 16px; }
    .pn-item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .pn-rail[data-collapsed] .pn-item {
      justify-content: center; width: 40px; height: 40px; padding: 0; margin: 2px auto;
    }
    .pn-rail[data-collapsed] .pn-group-label { justify-content: center; padding: 4px 0; }
    .pn-rail[data-collapsed] .pn-item-label,
    .pn-rail[data-collapsed] .pn-group-text { display: none; }
    .pn-rail-sep { width: 20px; height: 0.5px; flex: 0 0 auto; margin: 6px 0; background: var(--dsw-alias-border-l3); }

    .pn-rail-foot { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; padding-top: 6px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
    /* 页脚扩展位：登录等插件注册在这里，位于「插件管理」正下方。
       页脚可以让位给内容：插件在这里展开表单时，.pn-rail 的 overflow:hidden 会把它裁掉，
       所以给它可收缩的高度上限并在内部滚动。 */
    .pn-rail-account { display: flex; flex-direction: column; flex: 0 1 auto; min-height: 0; max-height: 60%; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
    .pn-rail-account::-webkit-scrollbar { display: none; }
    .pn-rail-account:empty { display: none; }
    /* 页脚图标：与产品行的 glyph 同尺寸、同颜色继承规则。展开态图标在前、
       文字在后；收起态文字整个不渲染，只剩居中的图标。 */
    .pn-foot-glyph { display: inline-flex; flex: 0 0 auto; margin-right: 8px; }
    .pn-rail[data-collapsed] .pn-foot-glyph { margin-right: 0; }
    /* 登录槽由其他插件注册，壳拿不到它的节点，只能在收起态把它居中。 */
    .pn-rail[data-collapsed] .pn-rail-account { display: flex; justify-content: center; width: 100%; }
    .pn-rail[data-collapsed] .pn-rail-account > * { display: flex; justify-content: center; }
    .pn-foot-button {
      display: flex; align-items: center; width: 100%;
      padding: 6px 8px; border: none; border-radius: 7px; background: transparent;
      color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px;
      cursor: pointer; text-align: left;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-foot-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
    }
    .pn-rail[data-collapsed] .pn-foot-label { display: none; }

    /*
     * 右列吃剩余预算。产品导航的宽度已经由组件按 props.width 算好并扣掉，所以
     * 这里不再声明最小宽度：再声明一次会把两列推过 ui-layout 给的列宽，溢出被裁。
     */
    /* 右列容器。
     *
     * 接管 sidebar 席位后，原生的 .root 不再渲染，它定义的四个局部变量就没人
     * 提供了——下游组件（如 ui-workspace 读 --dsh-session-list-edge-inset 再取
     * --dsh-sidebar-inline-padding）会拿不到值、退回自己的兜底，位置就对不齐。
     * 所以变量必须在**这一层**重新给出。
     *
     * 横向内边距必须在这里给，且只有这里给。逐一对照原生：
     *
     *   .root      padding: 6px 8px      ← 整列提供唯一基准
     *   .logoRow   Windows 下 padding: 0 ← 从 8 起步
     *   .panelRow  border-inline 3px + padding 9px
     *   .regionArea 在 grid 第 2 列，起点同样是 8
     *
     * 之前这里写 0，让子元素各自补 8：logoRow 落 0、pn-region 落 8、pn-panel 落 0，
     * 三条左沿互不相同。基准只能有一处。
     */
    .pn-nav {
      --dsh-sidebar-inline-padding: 8px;
      --dsh-sidebar-row-padding: 12px;
      --dsh-sidebar-label-gap: 6px;
      --dsh-sidebar-paint-inset: 3px;
      --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
      --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
      display: flex; flex-direction: column; flex: 1 1 0; flex-basis: 0%; min-width: 0; min-height: 0;
      padding: 6px var(--dsh-sidebar-inline-padding);
      box-sizing: border-box;
      color: var(--dsw-alias-label-primary);
      font-size: 14px;
    }
    .pn-nav-rail { align-items: center; gap: 2px; padding-top: 4px; }
    .pn-nav-empty {
      display: flex; align-items: center; justify-content: center; flex: 1 1 auto;
      padding: 24px 16px; text-align: center;
      color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.7;
    }
    /*
     * 品牌行，数值逐条取自原生 SidebarRoot.module.css:231-241：
     * 高度 60、padding 8 0 8 8、gap 8、justify-content flex-end、overflow hidden。
     * 原生这一行的 justify-content 是 flex-end，品牌按钮 flex:1 把自己撑开占满，
     * 折叠钮作为兄弟节点被推到行尾——不是把钮塞进品牌按钮里。
     */
    .pn-logo-row {
      flex: none;
      display: flex; align-items: center; justify-content: flex-end; gap: 8px;
      /*
       * 原生 .logoRow 基值：padding 8px 0 8px 8px。那个左 8px 是给非 Windows 平台行内折叠钮
       * 留的位置，logo 墨水因此落在 8 + 8 = 16。
       *
       * 不要为了「和面板图标齐平」去改它。原生三者的左沿本来就不同（实测 17 / 12 / 11）：
       * 每个元素从同一个 8px 基准各自花掉一点余量——logoRow 花 8、newSession 花 4、
       * panelRow 花 3。真正对齐的是右沿（407 / 408，差 1px 来自 0.5px 边框）。
       */
      height: 60px; padding: 8px 0 8px 8px; margin-bottom: 0;
      box-sizing: border-box; overflow: hidden;
    }
    /* 原生 .brand：flex:1 撑开、无内边距无边框，指针只是「可点」的提示，没有 hover 装饰。 */
    .pn-brand {
      flex: 1; min-width: 0;
      display: inline-flex; align-items: center; overflow: hidden;
      padding: 0; border: none; background: transparent; color: inherit;
      cursor: pointer;
    }
    /* 原生 .brandIdentity：图标与字标共享 24px 基线，间距 5。 */
    .pn-brand-identity {
      display: inline-flex; align-items: center; gap: 5px; height: 24px; min-width: 0;
    }
    /* 原生 .brandMark。 */
    .pn-brand-mark { flex: none; display: inline-flex; align-items: center; justify-content: center; }
    /*
     * 原生 .brandName：18px / 600 / 行高 24 / 字距 .04em。
     * 之前这里是 13px / 600——字号差了一档，所以字标看起来比原生小一圈。
     */
    .pn-brand-name {
      display: inline-flex; align-items: center; gap: 6px; min-width: 0;
      height: 24px; font-size: 18px; font-weight: 600; line-height: 24px;
      letter-spacing: 0.04em;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /*
     * 标题栏控制器。原生把这两个按钮 position: fixed 钉在窗口标题栏上，与列内布局无关，
     * 所以整列收到 0 宽时它们仍在——这就是「收起后还能展开」的唯一机制。
     *
     * 三个横向数值取自原生（SidebarRoot.module.css:94-120）：
     *
     *   left: 12px  →  折叠/展开钮
     *   left: 48px  →  新会话钮（仅收起态，展开态由品牌行那个按钮承担）
     *   84px        →  「应用 / 编辑」菜单起点，不推会被两个按钮压住
     *
     * 只在 html[data-windows-titlebar] 时显示：Web 端没有原生标题栏，fixed 会浮在页面上遮内容，
     * 那种情况用品牌行里那个行内按钮。
     */
    html[data-windows-titlebar]:has([data-sidebar-collapsed="true"]) {
      --dsh-windows-menu-start: 84px;
    }
    .pn-caption-toggle,
    .pn-caption-new {
      display: none;
    }
    /*
     * macOS：与 Windows 共用同两个按钮，但落点不同。
     *
     * 原生 window chrome 在 (88, 11)：红绿灯止于 x 68 → 20px 空档 → 折叠钮 28px
     * → 8px → 新会话钮 28px。darwin 的顶带固定 52px 高，按钮垂直居中落在
     * (52 - 28) / 2 = 12px，与原生 .leadingSeat 的 top 11 差 1px，取整可接受。
     *
     * 与 Windows 的差异：darwin 不隐藏整列，所以折叠钮常驻、新会话钮只在
     * 收起态出现（展开态由品牌行/列内的新会话按钮承担，避免重复入口）。
     */
    html[data-platform='darwin'] .pn-caption-toggle {
      position: fixed;
      top: 12px;
      left: 88px;
      z-index: 30;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; margin: 0; padding: 0;
      border: none; border-radius: var(--dsw-radius-sm, 6px);
      background: transparent; color: var(--dsw-alias-label-secondary);
      cursor: pointer; outline: none;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }
    /*
     * 只在整列隐藏时出现，与原生 HeaderLeadingControls 同条件
     * （它由框架在 darwin + collapsed 时挂载）。
     *
     * 不能无条件显示：.pn-shell 是三条布局分支的外层，展开态也在其中，那样
     * 顶带上会多出一个与列内「+ 新会话」重复的入口——而且它 fixed 在
     * (124, 12)，正好压在导航列右上角，看起来像列内按钮失灵。
     */
    html[data-platform='darwin'] [data-sidebar-collapsed] .pn-caption-new {
      position: fixed;
      top: 12px;
      left: 124px;
      z-index: 30;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; margin: 0; padding: 0;
      border: none; border-radius: var(--dsw-radius-sm, 6px);
      background: transparent; color: var(--dsw-alias-label-secondary);
      cursor: pointer; outline: none;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }
    /*
     * 全屏隐藏红绿灯（桌面 preload 把窗口状态镜像到 html[data-fullscreen]），
     * 控件因此要把红绿灯那段让位收回来，落到 x=12——与原生
     * AppFrame.module.css 的 [data-fullscreen] .leadingSeat { left: 12px } 同一量法。
     * 占了红绿灯的位置，新会话钮跟着左移 36px（28 + 8）。
     */
    html[data-platform='darwin'][data-fullscreen] .pn-caption-toggle {
      left: 12px;
    }
    html[data-platform='darwin'][data-fullscreen] .pn-caption-new {
      left: 48px;
    }
    html[data-windows-titlebar] .pn-caption-toggle {
      position: fixed;
      top: calc((var(--dsh-windows-titlebar-height, 40px) - 28px) / 2);
      left: 12px;
      z-index: 30;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; margin: 0; padding: 0;
      border: none; border-radius: var(--dsw-radius-sm, 6px);
      background: transparent; color: var(--dsw-alias-label-secondary);
      cursor: pointer; outline: none;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }
    html[data-windows-titlebar] [data-sidebar-collapsed] .pn-caption-new {
      position: fixed;
      top: calc((var(--dsh-windows-titlebar-height, 40px) - 28px) / 2);
      left: 48px;
      z-index: 30;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; margin: 0; padding: 0;
      border: none; border-radius: var(--dsw-radius-sm, 6px);
      background: transparent; color: var(--dsw-alias-label-secondary);
      cursor: pointer; outline: none;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    html[data-platform='darwin'] .pn-caption-toggle:hover,
    html[data-platform='darwin'] .pn-caption-new:hover,
    html[data-windows-titlebar] .pn-caption-toggle:hover,
    html[data-windows-titlebar] .pn-caption-new:hover {
      background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary);
    }
    }
    html[data-platform='darwin'] .pn-caption-toggle:focus-visible,
    html[data-platform='darwin'] .pn-caption-new:focus-visible,
    html[data-windows-titlebar] .pn-caption-toggle:focus-visible,
    html[data-windows-titlebar] .pn-caption-new:focus-visible {
      box-shadow: 0 0 0 var(--dsw-focus-ring-width, 2px) var(--dsw-focus-ring-color, currentColor);
    }
    html[data-windows-titlebar] .pn-caption-toggle[disabled] { opacity: .45; cursor: default; }
    html[data-platform='darwin'] .pn-caption-toggle[disabled] { opacity: .45; cursor: default; }
    /* 收起后品牌行高度归零，与原生 .root.collapsed .logoRow 一致；两个按钮因 fixed 不受影响。 */
    /*
     * Windows 桌面的 logo 行：保留左侧 8px，只把高度压到 40。
     *
     * 原生在这条覆盖里写 padding: 0（SidebarRoot.module.css:46-50）——Windows 的折叠钮
     * fixed 挂在标题栏、不占行内空间，所以左侧那 8px 让位。这里补回 8px 是**有意的偏离**：
     * 本插件的 FishLogo 不像原生 SVG 自带留白，落到 8 会贴着列边。
     *
     * 实测（485px 截图，列边界 x=179）补回前 logo 在 +7、面板行在 +21，差 12px；
     * 补回后 logo 落 16、面板行落 20，差 4px。
     *
     * 不取 12：那会让 logo 与面板图标严格同列（20），原生没有这样做，偏离也更大。
     */
    html[data-windows-titlebar] .pn-logo-row { height: 40px; margin: 0; padding: 0 0 0 8px; }
    html[data-windows-titlebar] .pn-logo-row[data-column-collapsed] { height: 0; overflow: hidden; }
    /* 品牌按钮的默认外观已并入上面的 .pn-brand（原生同样不写 button 前缀）。 */
    /*
     * 横向 margin 4px，与面板胶囊的 border-inline 3px + 1px 绘制边是同一个 4px 的两种写法。
     * align-self: stretch 下：列内容宽 224 − 4×2 = 216，与胶囊同宽。
     */
    .pn-new {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      /*
       * 横向撑满、纵向不伸。
       *
       * .pn-nav 是 flex-direction: column，所以主轴是纵向：
       *   - flex: 1 1 auto 会让它在**纵向**吃掉剩余高度（上一版按钮因此变成一块很高的白框）
       *   - 横向是交叉轴，由 align-self: stretch 撑满
       * 两者必须分开：flex: none 锁住高度（height: 38px），align-self 负责宽度。
       *
       * 宽度 = 列内容宽 224 − 左右 margin 4×2 = 216，与面板胶囊同宽。
       */
      flex: none;
      align-self: stretch;
      margin: 2px 4px 6px;
      /*
       * 高度必须是 38px 且显式写死。原生 .newSession 就是 height: 38px。
       * 不写的话高度由内容撑：line-height 22 + padding 8×2 + border 0.5×2 = 39，比原生高 1px，
       * 与面板行（min-height 32）的间距节奏也会跟着偏。
       */
      height: 38px;
      padding: 8px 12px; border-radius: var(--dsw-radius-md, 8px);
      border: 0.5px solid var(--dsw-alias-border-l3);
      background: var(--dsw-alias-button-elevated-fill);
      color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; font-weight: 500;
      line-height: 22px;
      cursor: pointer; text-align: center;
      /*
       * 必须 border-box。align-self: stretch 把宽度定在列内容宽 224，再被 4px 双侧 margin
       * 收到 216；content-box 会把 12px 水平 padding 与 0.5px 边框加在 216 之外，右沿被切。
       */
      box-sizing: border-box;
      max-width: 100%;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-new:hover { background: var(--dsw-alias-interactive-bg-hover); }
    }
    /*
     * 原生 .panelList：显式占第 2 列第 2 行。
     *
     * 位置必须写死。上一次设了网格却没给子元素定位，工作区被自动排进首列（4px），整块消失。
     */
    .pn-panels {
      grid-column: 2; grid-row: 2;
      display: flex; flex-direction: column; flex: 0 0 auto;
      gap: 2px; padding: 0; margin-bottom: 8px;
      /* 网格 1fr 项的默认 min-width 是 auto，长标签会把它顶宽并撑破整列。 */
      min-width: 0;
      box-sizing: border-box;
    }
    /* 原生 .panelRow：min-height 32、gap 6、padding 5px 9px、border-inline 3px 透明。 */
    .pn-panel {
      /*
       * 原生 .panelRow：padding 5px calc(12px - 3px)，border-inline 3px 透明。
       *
       * 那 3px 是**绘制内缩**，不是额外偏移：网格首列 4px 被负 margin 抵消后，第 2 列从整列的
       * 8px 起，3px 边框落在这 8px 之内，胶囊底色因此不顶到列边缘。它与 grid 是一套，
       * 单独去掉会让内容反向外推 3px；单独加回来而没有 grid 也一样错。
       */
      display: flex; align-items: center; gap: var(--dsh-sidebar-label-gap);
      min-height: 32px;
      padding: 5px calc(var(--dsh-sidebar-row-padding) - var(--dsh-sidebar-paint-inset));
      /*
       * 上下的 0 必须显式写。.pn-panel 是 button，浏览器给它默认
       * border: 2px outset；只声明 border-inline 等于让 border-block
       * 继续继承那条默认值，于是每一行上下各多出 2px 凸起边框——
       * 面板列表看起来就是「一堆带框的条」。
       */
      border: 0 solid transparent;
      border-inline: var(--dsh-sidebar-paint-inset) solid transparent;
      background-clip: padding-box;
      line-height: 22px;
      border-radius: var(--dsw-radius-md, 8px);
      box-sizing: border-box;
      background: transparent;
      /* 同 .pn-item：静置主色，与原生 .panelRow 一致。 */
      color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
      cursor: pointer; text-align: left;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-panel:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
    }
    .pn-panel[data-active] { background: var(--dsw-specific-sidebar-nav-item-active); color: var(--dsw-alias-label-primary); }
    .pn-panel-glyph { display: inline-flex; flex: 0 0 auto; }
    .pn-panel-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* 工作区区域。
     *
     * ui-workspace 的 WorkspaceBrowser 自己只设 padding-right（取
     * --dsh-session-list-edge-inset），**左侧内边距由外层容器提供**——原生是靠
     * 横向内边距不在这里给——基准由 .pn-nav 统一提供（padding: 6px 8px），
     * 与原生 .root 一致。这里再补一层就是 16px，工作区会比 logo 和面板行深一格。
     *
     * 那几个局部变量仍然要给：下游按变量算右侧内缩量，变量缺失右边图标会再错一次。 */
    .pn-region {
      --dsh-sidebar-inline-padding: 8px;
      --dsh-sidebar-row-padding: 12px;
      --dsh-sidebar-label-gap: 6px;
      --dsh-sidebar-paint-inset: 3px;
      --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
      --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
      display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden;
      padding: 0;
      box-sizing: border-box;
    }
    .pn-foot {
      display: flex; flex-direction: column; flex: 0 0 auto; gap: 2px; padding: 6px 8px 10px;
      /*
       * 同 .pn-new：它是 .pn-nav 的直接子元素，stretch 给的是内容宽度，
       * 不加 border-box 时左右 8px padding 会加到外面，页脚内容因此右溢。
       */
      box-sizing: border-box;
      max-width: 100%;
    }
    .pn-collapsed-new, .pn-collapsed-panel {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; flex: 0 0 32px; padding: 0;
      border: none; border-radius: 8px; background: transparent;
      color: var(--dsw-alias-label-secondary); font: inherit; font-size: 16px; cursor: pointer;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-collapsed-new:hover, .pn-collapsed-panel:hover {
      background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary);
    }
    }
    .pn-collapsed-panel[data-active] { background: var(--dsw-specific-sidebar-nav-item-active); color: var(--dsw-alias-label-primary); }
    .pn-error {
      margin: 12px; padding: 12px; border-radius: 8px; overflow: auto;
      font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--dsw-alias-state-error-primary);
      background: var(--dsw-alias-bg-layer-2);
      white-space: pre-wrap; word-break: break-word;
    }
    /*
     * 导航配置页。按产品家族规范：白卡承载（radius 12），行式列表每行一张白卡
     * （radius 8 + 双层柔影），控件圆角 6，文字四级灰阶，品牌紫是唯一强调色。
     * 不引用 DSH 变量：产品页统一用家族 token，深浅才不随宿主主题漂。
     */
    .pn-cfg {
      height: 100%; box-sizing: border-box; overflow-y: auto;
      padding: 24px; padding-top: 12px; border-radius: 12px;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font: 13px/1.8 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .pn-cfg-head {
      display: flex; align-items: flex-start; gap: 16px;
      padding-bottom: 16px; margin-bottom: 16px;
      border-bottom: 1px solid var(--dsw-alias-border-l2);
    }
    .pn-cfg-title { font-size: 17px; font-weight: 600; color: var(--dsw-alias-label-primary); line-height: 1.4; }
    .pn-cfg-sub { margin-top: 4px; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
    .pn-cfg-actions { display: flex; gap: 8px; margin-left: auto; flex: 0 0 auto; }
    .pn-btn {
      height: 32px; padding: 0 16px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 13px;
      transition: border-color .2s, color .2s, background .2s;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    }
    .pn-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-btn-primary:hover { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
    }

    /* 行式列表：每行一张白卡，行间 10px 由 borderSpacing 给出。 */
    .pn-table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
    .pn-table thead th {
      padding: 0 12px 4px; text-align: left;
      font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-caption); white-space: nowrap;
      /* 末列的单元格带 1px 右边框（见 td:last-child）。border-collapse: separate 下边框占内容盒
         宽度，表头没有边框就会让右对齐的「操作」标题比列内容右移 1px。补一条透明边框对齐盒模型。 */
      border-right: 1px solid transparent;
    }
    /* 首列同理：单元格有 1px 左边框，表头补齐，左对齐的标题才不会左移 1px。 */
    .pn-table thead th:first-child { border-left: 1px solid transparent; }
    .pn-table tbody td {
      padding: 12px; background: var(--dsw-alias-bg-base); vertical-align: middle;
      border-top: 1px solid var(--dsw-alias-border-l2); border-bottom: 1px solid var(--dsw-alias-border-l2);
      transition: background .15s;
    }
    .pn-table tbody td:first-child {
      border-left: 1px solid var(--dsw-alias-border-l2); border-radius: 8px 0 0 8px;
    }
    .pn-table tbody td:last-child {
      border-right: 1px solid var(--dsw-alias-border-l2); border-radius: 0 8px 8px 0;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-table tbody tr:hover td { background: var(--dsw-alias-interactive-bg-hover); }
    }
    /*
     * 拖动反馈。三类视觉信号各管一件事：
     *   被拖的行——抬起（阴影 + 轻微放大 + 半透明），让用户知道「手上有东西」；
     *   目标行——只做淡底，说明「会落在这个区域」；
     *   插入线——2px 品牌紫，说明「插在这一行的上沿还是下沿」，这才是排序真正要看的。
     * 全部走 .15s 过渡，避免状态切换时的跳变。
     */
    .pn-table tbody td { transition: background .15s, border-color .15s, box-shadow .15s, opacity .15s; }
    .pn-row.is-dragging td {
      opacity: .5;
      box-shadow: 0 6px 16px -4px color-mix(in srgb, var(--dsw-alias-label-primary) 25%, transparent);
      background: var(--dsw-specific-sidebar-nav-item-active);
    }
    .pn-row.is-dragging .pn-handle { cursor: grabbing; color: var(--dsw-alias-brand-primary); }
    .pn-row.is-drop-before td { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
    .pn-row.is-drop-after td { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
    /* 插入线画在行卡的上沿/下沿内侧，跟着卡片圆角走。 */
    .pn-row.is-drop-before td { box-shadow: inset 0 2px 0 0 var(--dsw-alias-brand-primary); }
    .pn-row.is-drop-after td { box-shadow: inset 0 -2px 0 0 var(--dsw-alias-brand-primary); }
    .pn-row.is-dragging.is-drop-before td,
    .pn-row.is-dragging.is-drop-after td { box-shadow: 0 6px 16px -4px color-mix(in srgb, var(--dsw-alias-label-primary) 25%, transparent); }

    /*
     * 产品拖动落在某组上：整行是目标，所以整行被框起来。
     *
     * 不能靠 box-shadow：它按元素画，六格就是六圈，看起来是「里面还有边框」。外沿应当是
     * 一整条，所以用四条边拼——每格给上下边，首格补左边、末格补右边，合起来正好围住一行。
     * 底色保留：框标明落点，底色让这一行读成一整块而不是六格。
     */
    .pn-row.is-drop-into td {
      background: var(--dsw-specific-sidebar-nav-item-active);
      border-top: 1px solid var(--dsw-alias-brand-primary);
      border-bottom: 1px solid var(--dsw-alias-brand-primary);
    }
    .pn-row.is-drop-into td:first-child {
      border-left: 1px solid var(--dsw-alias-brand-primary);
      border-top-left-radius: 8px; border-bottom-left-radius: 8px;
    }
    .pn-row.is-drop-into td:last-child {
      border-right: 1px solid var(--dsw-alias-brand-primary);
      border-top-right-radius: 8px; border-bottom-right-radius: 8px;
    }
    .pn-row.is-drop-into .pn-name { color: var(--dsw-alias-label-primary); }

    /*
     * 拖动热区。原来的 ⠿ 字形只有 14px 宽，鼠标偏一两像素就落到文字上，变成选中文本
     * 而不是拖动。现在把手柄做成填满整格的 40×40 区域：形状仍是那六个点，但可点的
     * 范围覆盖整格，且 user-select 关掉，误触也不会选中文字。
     */
    .pn-cell-handle { width: 48px; padding: 4px 0 4px 8px; text-align: center; }
    /*
     * 名称列给固定宽度：中文组名 + 改名铅笔只需要这么多，剩下的宽度应当留给标签。
     * 之前这一列没有宽度，浏览器把全部余量都给了它，于是组名占掉一千多像素、标签被挤成一列。
     */
    .pn-cell-name { width: 200px; }
    .pn-handle {
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 6px;
      cursor: grab; user-select: none; -webkit-user-select: none;
      color: var(--dsw-alias-label-caption); font-size: 15px; line-height: 1;
      transition: background .15s, color .15s;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-handle:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); }
    }
    .pn-handle:active { cursor: grabbing; }
    /* 拖动期间整行不参与文本选择，避免鼠标划过去选中一大片。 */
    .pn-row.is-dragging td,
    .pn-table tbody tr[draggable] { user-select: none; -webkit-user-select: none; }
    .pn-name { color: var(--dsw-alias-label-primary); font-weight: 500; }
    .pn-name-muted { color: var(--dsw-alias-label-secondary); font-weight: 400; }
    .pn-name-input {
      width: 100%; max-width: 320px; height: 28px; padding: 0 8px;
      border: 1px solid var(--dsw-alias-brand-primary); border-radius: 6px;
      font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base);
    }
    .pn-name-input:focus { outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }

    /*
     * 标签列。宽度不写死：它要吃掉名称列之外的全部余量。white-space 设成 normal 是关键——
     * 上一版沿用了数字列的 nowrap，标签只能一个一个换行，五枚标签就把整行撑成一列。
     */
    .pn-cell-count { white-space: normal; min-width: 320px; }


    .pn-cell-state, .pn-cell-open { width: 112px; white-space: nowrap; }
    .pn-switch { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .pn-switch input { margin: 0; cursor: pointer; accent-color: var(--dsw-alias-brand-primary); }
    .pn-switch input:disabled { cursor: not-allowed; }
    .pn-switch-text { font-size: 13px; color: var(--dsw-alias-label-tertiary); }

    .pn-cell-actions { width: 80px; text-align: right; white-space: nowrap; }
    /* 表头的「操作」必须跟着右对齐。上方 thead th 的 text-align: left 特异性 0,2,1 压过单独的
       .pn-cell-actions（0,1,0），不加这条标题会贴到列左边缘、与右侧的删除按钮隔着半个列宽。 */
    .pn-table thead th.pn-cell-actions { text-align: right; }
    /* 空操作格用零高占位撑住宽度，与有按钮的行同宽。 */
    .pn-actions-placeholder { display: inline-block; width: 28px; height: 1px; }
    /* 名称与其后的改名图标。图标默认淡出，hover 名称区时显现——常驻可见会让每一行都多一个
       视觉重物，而改名是低频操作。 */
    .pn-name-wrap { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
    .pn-rename {
      display: inline-flex; align-items: center; justify-content: center;
      flex: 0 0 auto; width: 20px; height: 20px; padding: 0;
      border: none; border-radius: 4px; background: transparent;
      color: var(--dsw-alias-label-caption); cursor: pointer;
      opacity: 0; transition: opacity .15s, background .15s, color .15s;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-row:hover .pn-rename, .pn-rename:focus-visible { opacity: 1; }
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-rename:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-brand-primary); }
    }
    .pn-link {
      padding: 2px 6px; border: none; border-radius: 6px; cursor: pointer;
      background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 13px;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-link:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }
    }
    .pn-link-danger { color: var(--dsw-alias-label-caption); }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-link-danger:hover { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent); }
    }


    .pn-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; row-gap: 6px; }
    /* 空组说明：与标签同高，灰字，不占满整行。 */
    .pn-chips-empty { font-size: 12px; color: var(--dsw-alias-label-caption); }
    .pn-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px;
      border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
      font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: grab;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-chip:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
    }
    /*
     * 组内重排落点。上一版是 padding 内的 2px 内阴影，贴在已有 1px 描边的胶囊边上几乎看不见。
     * 现在画在胶囊外侧、留 3px 空隙——空隙本身就是「会插到这里」的证据。
     */
    .pn-chip.is-drop-before {
      box-shadow: -3px 0 0 0 var(--dsw-alias-brand-primary);
      margin-left: 3px;
    }
    .pn-chip.is-drop-after {
      box-shadow: 3px 0 0 0 var(--dsw-alias-brand-primary);
      margin-right: 3px;
    }
    /* 尾部落点：最后一个标签右边的空白区，拖上去表示「放到最后」。 */
    /* 尾部落点：「拖到本组最后一位」的热区，不是输入框。
       早先 flex: 1 1 32px 配 align-self: stretch 会吃掉整行剩余宽度，看起来像一条
       灰色空框，实际什么都不显示。改成零尺寸：不拖动时不可见，拖动悬停时
       才展开成一条细线作为落点提示。 */
    .pn-chips-tail {
      flex: 0 0 0; width: 0; min-width: 0; align-self: center; height: 2px;
      border-radius: 999px; transition: flex-basis .12s, width .12s, background .12s;
    }
    .pn-chips-tail.is-over {
      flex: 1 1 32px; width: auto; min-width: 32px; height: 6px;
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
      box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
    }
    .pn-chip input { margin: 0; cursor: pointer; accent-color: var(--dsw-alias-brand-primary); }
    /* 六点手柄：与分组行的拖动柄同一个字形，用户不必学第二套「可拖」语言。 */
    .pn-chip-grip {
      color: var(--dsw-alias-label-caption); font-size: 11px; line-height: 1;
      opacity: .45; transition: opacity .15s; user-select: none;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-chip:hover .pn-chip-grip { opacity: 1; }
    }
    /* 隐藏的产品压暗但仍可操作：用户要看得见「它还在，只是没显示」。 */
    .pn-chip.is-off { opacity: .55; }
    .pn-chip.is-off .pn-chip-label { text-decoration: line-through; }
    /* 拖起时抬离并虚化，表示「手上这份是副本、原位还在」。 */
    .pn-chip.is-dragging {
      opacity: .4; cursor: grabbing;
      box-shadow: 0 4px 12px -3px color-mix(in srgb, var(--dsw-alias-label-primary) 30%, transparent);
    }
    .pn-chip.is-picked {
      border-color: var(--dsw-alias-brand-primary);
      box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
    }
    .pn-pick-move { display: inline-flex; align-items: center; gap: 6px; }
    .pn-pick-count { color: var(--dsw-alias-brand-primary); font-variant-numeric: tabular-nums; }
    .pn-pick-select {
      padding: 2px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px;
      background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 12px; cursor: pointer; max-width: 160px;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-pick-select:hover { border-color: var(--dsw-alias-brand-primary); }
    }

    .pn-chipbar-btn {
      padding: 2px 8px; border: none; border-radius: 6px; cursor: pointer;
      background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-chipbar-btn:hover {
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
      color: var(--dsw-alias-brand-primary);
    }
    }



    .pn-cfg-foot {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      margin-top: 4px; font-size: 13px; color: var(--dsw-alias-label-caption);
    }
    .pn-cfg-tip { color: var(--dsw-alias-label-caption); }

    /* 「更多」弹层。坐标由内联 style 给（fixed + 实测位置），这里只管外观。
       fixed 定位不受 .pn-nav / .pn-rail 的 overflow 裁剪——早先绝对定位那版点开看不见，
       就是因为被裁剪。
       尺度跟随本列自己的行（.pn-panel）：gap 8 / padding 6 8 / radius 7 / 13px /
       label-secondary / sidebar-nav-item-hover。不抄原生 Menu 的 34px 行高——那是弹层菜单
       的尺度，放进这条侧栏会与同一列的面板行对不上。卡片圆角比行大一圈（12 vs 7），
       否则首行的直角会切进卡片的圆角。
       注意：本块在一个模板字符串里，注释中不能出现反引号。 */
    .pn-more-surface {
      display: flex; flex-direction: column; gap: 1px;
      position: relative;
      /* 把材质层锁在自己的层叠上下文里，z-index:-1 才不会逃到外面。 */
      isolation: isolate;
      padding: 4px; border-radius: 12px;
      /* 底色不在这里画，交给下面的材质层。 */
      background: transparent;
      border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08));
      box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.14));
    }
    /*
     * 材质层。menu-surface-fill 本身半透明（亮 0.7 / 暗 0.64），原生靠这一层的 backdrop-filter
     * 把它撑成实心卡片。只取颜色、省掉模糊，卡片就是透的：背后的导航行会透出来、与菜单文字
     * 叠在一起。fallback 取 bg-layer-1 而不是纯白——token 名写错时不应整块变白。
     */
    .pn-more-material {
      position: absolute; inset: 0; z-index: -1;
      border-radius: inherit;
      background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-layer-1, #fff));
      -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
      /* Safari 需要 -webkit- 前缀；只写标准属性时弹层在该引擎上是平的。 */
      -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
      backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
      pointer-events: none;
    }
    .pn-more-trigger[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }

    .pn-more-row {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 6px 8px;
      border: none; border-radius: 7px;
      /* 菜单行静置主色；原先用次级色，于是整张菜单看起来是禁用态。 */
      background: transparent; color: var(--dsw-alias-label-primary);
      font-size: 13px; text-align: left; cursor: pointer; outline: none;
    }
    /* 触屏无指针离开，裸 :hover 会粘连；原生 .panelRow 同样包这层（SidebarRoot.module.css:705）。 */
    @media (hover: hover) {
    .pn-more-row:hover,
    .pn-more-row:focus-visible {
      background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary);
    }
    }
    .pn-more-row-glyph { display: inline-flex; flex: 0 0 auto; }
    .pn-more-row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /*
     * 系统级「减少动态效果」（无障碍设置，部分受管设备默认开启）下关掉过渡与动画。
     *
     * 这里清的是**时长**而不是属性：布局与配色的变化仍然立即生效，只是不再滑动/淡入。
     * 九条 transition 与落点指示线动画都不承载信息，去掉不影响可用性。
     */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
      }
    }
    /*
     * 触屏输入框 16px 下限：iOS Safari 在聚焦 font-size < 16px 的输入框时会把整页放大，
     * 失焦也不还原，期间固定的列宽几何一起失真。
     *
     * 只对 coarse 指针生效——精确指针没有这个行为，13px 的紧凑行才是本意。
     * (pointer: coarse) 查的是主指针类型而非当前事件，带触控板的混合设备仍走紧凑值。
     *
     * 同族做法见 packages/client/ui-plugin-manager 的 PluginManagerPage.module.css。
     */
    @media (pointer: coarse) {
      .pn-name-input { font-size: 16px; }
    }
    `


    /** 24 单位描边网格上的图标路径，一个产品一条。 */
    const GLYPHS = {
      workbench: 'M4 4h6.5v6.5H4zM13.5 4H20v4h-6.5zM13.5 10.5H20V20h-6.5zM4 13h6.5v7H4z',
      collaboration: 'M9 11a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 9 11zM3.5 19c0-2.6 2.4-4.5 5.5-4.5s5.5 1.9 5.5 4.5zM16 10.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z',
      dsh: 'M4 6.5 10 10V6.5l6 3.5v9H4zM16 12h4v7h-4zM7 15h3M7 18h3',
      ontology: 'M12 3.5 20 8v8l-8 4.5L4 16V8zM12 12l8-4M12 12v8.5M12 12 4 8',
      platformAi: 'M5 8h14M5 12h9M5 16h12M3.5 5.5v13M20.5 5.5v13',
      team: 'M8 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 19c0-2.4 2.2-4 5-4s5 1.6 5 4zM16.5 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
      test: 'M9 3.5h6M10.5 3.5v6L6 18a1.5 1.5 0 0 0 1.4 2.2h9.2A1.5 1.5 0 0 0 18 18l-4.5-8.5v-6M8 14h8',
      wiki: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2.5 2.5 0 0 1 2 1v14a2.5 2.5 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 16.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2.5 2.5 0 0 0-2 1v14a2.5 2.5 0 0 1 2-1h4.5a1.5 1.5 0 0 0 1.5-1.5z',
      insight: 'M4 19V9M9.5 19V5M15 19v-7M20.5 19v-4M3 21h18',
      portfolio: 'M4 8h16v11H4zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16',
      pipelines: 'M8 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 6.5v11.5M10 12h4',
      artifacts: 'M12 3.5c4.4 0 8 1.3 8 3v11c0 1.7-3.6 3-8 3s-8-1.3-8-3v-11c0-1.7 3.6-3 8-3zM4 6.5c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
      delivery: 'M12 3.5 20 7.5v9L12 20.5 4 16.5v-9zM12 12l8-4.5M12 12v8.5M12 12 4 7.5',
      yuandun: 'M12 3.5 19 6v6c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V6zM9 12l2 2 4-4',
      sast: 'M12 3.5 19 6v6c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V6zM12 9v4M12 16h.01',
      // 页脚：插件管理（方块拼成的插件插座 + 中心触点）。
      plugins: 'M4.5 4.5h5v5h-5zM14.5 4.5h5v5h-5zM4.5 14.5h5v5h-5zM14.5 14.5h5v5h-5zM9.5 7h5M7 9.5v5',

      // 与原生 More 按钮同一个四格标记（IconAppsAddOutlineRegular 的轮廓）。
      more: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6zM17 4v6M14 7h6',
      // 页脚：导航配置（滑杆：两条轨道加各自的把手）。
      configure: 'M5 7h3M11 7h8M5 13h8M16 13h3M5 19h5M13 19h6M8 5v4M16 11v4M10 17v4',
      sca: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01',
      settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.8a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.2 8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.9 4V3.8a2 2 0 1 1 4 0V4a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z',
      collapse: 'M15 6l-6 6 6 6',
    }

    /**
     * 解析注册标签，允许 thunk 形式以便每次投影重读当前语言。
     * @param label - 注册时给的标签。
     * @param fallback - 标签缺失时的兜底文本。
     * @returns 可显示的文本。
     */
    function labelOf(label, fallback) {
      const value = typeof label === 'function' ? label() : label
      return typeof value === 'string' && value.length > 0 ? value : fallback
    }

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore, startTransition } = React

    /**
     * 为一条 24 单位描边路径生成图标组件。
     * @param path - 用 currentColor 描边的 SVG 路径。
     * @returns 零 prop 的 React 组件。
     */
    const glyph = (path) => function Glyph() {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: '18',
        height: '18',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.6',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'aria-hidden': 'true',
      }, h('path', { d: path }))
    }

    /**
     * ui-primitives 的 16 单元图标：一条或多条描边路径，1px 描边。
     *
     * 与上面的 `glyph()` 分开，是因为坐标系不同：`glyph()` 画在 24 单元、1.6 描边上（产品行的
     * 尺度），而原生菜单图标是 16 单元、1px 描边。把 16 单元路径塞进 24 单元盒子会缩到三分之二、
     * 描边变细，16px 下就显得"差一点"。
     * @param paths - 描边路径数组，取自 ui-primitives/src/icons/artwork.ts。
     * @returns 按传入尺寸渲染的图标组件。
     */
    const icon16 = (paths) => function Icon16(props) {
      const size = props !== null && props !== undefined && props.size !== undefined ? props.size : 16
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'aria-hidden': 'true',
      }, paths.map((d, index) => h("path", { key: index, d })))
    }

    /** 原生 IconPlusOutlineRegular：两笔，横竖各一。 */
    const IconPlus = icon16(["M8 2V14", "M2 8H14"])
    // 原生 data-sidebar-toggle 的图形：左侧竖条 + 外框的方形。
    // 与壳里其他图标同一坐标系（16 单位、1px 描边）；混用 24 单位会缩成 2/3。
    /**
     * 原生 panel-left-outline 的逐点路径（ui-primitives/src/icons/artwork.ts:31）。
     *
     * 客户端插件 import 不到 ui-primitives 的图标组件，所以原样抄 path，不重画：
     * 一个圆角外框 + 一条竖分隔线，16 单位坐标系。
     */
    const IconPanelLeft = icon16([
      "M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z",
      "M5.5 1.5V14.5",
    ])
    /**
     * 原生 new-chat-outline 的逐点路径（artwork.ts:25）：气泡轮廓 + 中间十字。
     */
    const IconNewChat = icon16([
      "M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.0914 5.87206 14.4754 7.4334C14.612 8.99474 14.1803 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337",
      "M8 5V11",
      "M5 8H11",
    ])

    /** 原生 IconPluginPinwheelOutlineRegular：四片弧形叶片。 */
    const IconPinwheel = icon16([
      "M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942",
      "M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037",
      "M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798",
      "M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723",
    ])

    /**
     * 原生品牌兜底：`ui-primitives/src/FishLogo.tsx` 的原样移植。
     *
     * 本壳接管 sidebar 席位后，`sidebar.brand.mark` 若无人注册就什么都不画，品牌行空一截；
     * 原生用这个图形兜底（`SidebarRoot.tsx:341`），所以这里给同一份几何。
     *
     * 不复用那个包：client 插件无法 require 另一个 client 包（模块表只认平台种子词、
     * 已物化模块与已注册插件，实测三次全部 miss）。路径是数据不是布局，抄过来才能保证两边
     * 长得一样，而不是各画各的。
     *
     * 原生 viewBox 是 23.16 × 17.04，高度按比例缩，否则鱼会被拉扁。
     */
    const FISH_LOGO_VIEWBOX = { width: 23.16, height: 17.04 }
    const FISH_LOGO_PATH = 'M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z'

    /**
     * 画鱼形标记。
     * @param props - `size` 为宽度（默认 24），`className` 供布局使用。
     * @returns 无内联尺寸依赖的 svg；`aria-hidden`，可访问名交给文字标。
     */
    function FishLogo(props) {
      const size = props.size ?? 24
      return h('svg', {
        width: size,
        height: Math.round((size * FISH_LOGO_VIEWBOX.height / FISH_LOGO_VIEWBOX.width) * 100) / 100,
        viewBox: `0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`,
        fill: 'none',
        'aria-hidden': 'true',
      }, h('path', { d: FISH_LOGO_PATH, fill: 'currentColor' }))
    }

    const GLYPH_COMPONENTS = Object.fromEntries(
      Object.entries(GLYPHS).map(([key, path]) => [key, glyph(path)]),
    )

    /**
     * 锚定弹层：面板列表「更多」的菜单面。
     *
     * 原生那个（SidebarRoot 的 PanelMoreMenu）建立在 ui-primitives 的 Menu + Tooltip 上，
     * client 插件不能 require，所以自绘。Menu 提供四件事：portal（逃出祖先裁剪）、锚定定位
     * （贴边翻转）、Esc 与点外关闭、键盘漫游。这里逐条补齐。
     *
     * 裁剪是决定性的一点：.pn-nav 与 .pn-rail 都是 overflow: hidden，绝对定位的子节点会
     * 被裁掉，点了看不见。fixed 定位的后代不受 overflow 裁剪，因此无需 portal 就能脱困。
     *
     * 组件自己持有开关、定位与关闭；调用方只给触发器外观与菜单内容（children 函数），内容
     * 仍留在组件树里，sidebar.panellist.actions 的槽位 props 因此保持完整。
     * @param props - label、触发器类名、图标/文字类名，以及渲染菜单内容的 children。
     * @returns 触发器与它打开时的弹层。
     */
    function AnchoredMenu(props) {
      const { label, triggerClassName, glyphClass, labelClass, children } = props
      const [open, setOpen] = useState(false)
      const [placement, setPlacement] = useState(null)
      const anchorRef = useRef(null)
      const surfaceRef = useRef(null)
      const close = useCallback(() => { setOpen(false) }, [])

      // 打开时量一次：下方放得下就贴下，否则翻到上方；左右夹进视口。
      const place = useCallback(() => {
        const anchor = anchorRef.current
        if (anchor === null) return
        const rect = anchor.getBoundingClientRect()
        const surface = surfaceRef.current
        const height = surface === null ? 0 : surface.getBoundingClientRect().height
        const width = surface === null ? 220 : surface.getBoundingClientRect().width
        const gap = 4
        const margin = 8
        const below = window.innerHeight - rect.bottom - gap - margin
        const above = rect.top - gap - margin
        const top = height > below && above > below
          ? Math.max(margin, rect.top - gap - height)
          : rect.bottom + gap
        const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
        setPlacement({ top, left })
      }, [])

      useEffect(() => {
        if (!open) { setPlacement(null); return undefined }
        place()
        const onDown = (event) => {
          const surface = surfaceRef.current
          const anchor = anchorRef.current
          if (surface !== null && surface.contains(event.target)) return
          if (anchor !== null && anchor.contains(event.target)) return
          close()
        }
        const onKey = (event) => {
          if (event.key === "Escape") { close(); return }
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
          const surface = surfaceRef.current
          if (surface === null) return
          const rows = Array.from(surface.querySelectorAll("[role=\"menuitem\"]"))
          if (rows.length === 0) return
          event.preventDefault()
          const at = rows.indexOf(document.activeElement)
          const next = event.key === "ArrowDown"
            ? (at < 0 ? 0 : (at + 1) % rows.length)
            : (at < 0 ? rows.length - 1 : (at - 1 + rows.length) % rows.length)
          rows[next].focus()
        }
        // fixed 元素不随祖先滚动，滚动即关闭，避免与触发器分离。
        const onScroll = () => { close() }
        window.addEventListener("mousedown", onDown, true)
        window.addEventListener("keydown", onKey)
        window.addEventListener("resize", place)
        window.addEventListener("scroll", onScroll, true)
        return () => {
          window.removeEventListener("mousedown", onDown, true)
          window.removeEventListener("keydown", onKey)
          window.removeEventListener("resize", place)
          window.removeEventListener("scroll", onScroll, true)
        }
      }, [open, close, place])

      return h("div", { style: { display: "contents" } },
        h("button", {
          ref: anchorRef,
          type: "button",
          className: triggerClassName,
          "aria-haspopup": "menu",
          "aria-expanded": open ? "true" : "false",
          "aria-label": label,
          title: label,
          onClick: () => { setOpen((value) => !value) },
        },
        h("span", { className: glyphClass, "aria-hidden": "true" }, h(GLYPH_COMPONENTS.more, null)),
        labelClass === null || labelClass === undefined ? null : h("span", { className: labelClass }, label)),
        open
          ? h("div", {
            ref: surfaceRef,
            className: "pn-more-surface",
            role: "menu",
            "aria-label": label,
            style: {
              position: "fixed",
              top: (placement === null ? -9999 : placement.top) + "px",
              left: (placement === null ? -9999 : placement.left) + "px",
              minWidth: "220px",
              maxWidth: "320px",
              zIndex: 60,
            },
          },
          // 材质层排在内容之前，绝对定位在卡片内部、z-index 低于内容。
          h("div", { className: "pn-more-material", "aria-hidden": "true" }),
          children(close))
          : null)
    }

    /**
     * 出厂分组：id、字典键与默认顺序。
     *
     * 分组**不再由槽位表达**——所有产品行都注册进同一个 `sidebar.products`，组别由
     * 配置决定（见 `DEFAULT_GROUPS` 与 `resolveGrouping`）。这里只保留壳认识的分组
     * 身份，供配置页列出、并为第三方注册留一个默认落点。
     *
     * 第一个分组是不画标题的默认分组，收纳没有归属的产品；其余按业务域收展。
     *
     * `slot` 字段仅为兼容旧注册路径保留（订阅时还要监听那几个槽，迁移期有包可能仍
     * 注册进去）；渲染不再读它。
     */
    const SECTIONS = [
      { id: 'g-default', labelKey: null, order: 0, slot: 'sidebar.products' },
      { id: 'g-ai', labelKey: 'section.ai', order: 10, slot: 'sidebar.products.g-ai' },
      { id: 'g-pm', labelKey: 'section.pm', order: 20, slot: 'sidebar.products.g-pm' },
      { id: 'g-code', labelKey: 'section.code', order: 25, slot: 'sidebar.products.g-code' },
      { id: 'g-cicd', labelKey: 'section.cicd', order: 30, slot: 'sidebar.products.g-cicd' },
      { id: 'g-sec', labelKey: 'section.sec', order: 40, slot: 'sidebar.products.g-sec' },
      { id: 'g-platform', labelKey: 'section.platform', order: 50, slot: 'sidebar.products.g-platform' },
    ]

    /**
     * The one slot every product row registers into.
     *
     * Products no longer pick a group; `slotFor` in the contract package returns this for
     * every product. Grouping is the shell's job and lives in the user's configuration.
     */
    const PRODUCT_SLOT = 'sidebar.products'

    /**
     * Seed mapping: product id → the group it starts in.
     *
     * `register` rebuilds options through a fixed field list, so a product cannot hand its
     * group to the shell — the registrant only carries id, order and label. The shell
     * therefore keeps the factory default here, and the user's configuration overrides it
     * from the first edit onward. Kept in product order per group so a fresh install looks
     * exactly like the designed navigation.
     */
    const DEFAULT_GROUPS = {
      'g-default': ['product-workbench', 'product-super-workbench', 'product-collaboration'],
      'g-ai': ['product-conversation', 'product-ontology', 'product-platform-ai'],
      'g-pm': ['product-team', 'product-test', 'product-wiki', 'product-insight', 'product-portfolio'],
      'g-code': ['product-code', 'product-review', 'product-vision', 'product-scan', 'product-cloudide'],
      'g-cicd': ['product-pipelines', 'product-artifacts', 'product-delivery'],
      'g-sec': ['product-yuandun', 'product-sast', 'product-sca'],
      'g-platform': ['product-help', 'product-settings'],
    }

    /** Product id → group id, derived once from the seed above. */
    const DEFAULT_GROUP_OF = Object.fromEntries(
      Object.entries(DEFAULT_GROUPS).flatMap(([group, ids]) => ids.map((id) => [id, group])),
    )

    /** The anchor group: every row without a declared group falls back here. */
    const DEFAULT_SECTION_ID = 'g-default'

    /** The `main` key the navigation-config page registers under. */
    const NAV_CONFIG_ID = 'product-nav-config'

    /**
     * Groups the rail leaves out until the user turns them on.
     *
     * A fresh install should show the AI Harness group and nothing else: the business domains
     * belong to plugins the user has not installed yet, so showing them by default puts rows of
     * empty headings in the rail and reads as a loading failure. `g-ai` is the one group that
     * always has content, because the conversation entry is built in.
     *
     * `g-default` is deliberately absent: it is the anchor that receives unassigned products
     * and cannot be hidden. Hiding it here would contradict the rule enforced by the config
     * page and leave those rows with nowhere to land.
     */
    const DEFAULT_HIDDEN_SECTIONS = ['g-pm', 'g-code', 'g-cicd', 'g-sec', 'g-platform']

/**
 * Groups expanded before the user changes anything.
 *
 * `g-default` is where unassigned product rows land (`sidebar.products`), and
 * `g-ai` carries the AI Harness group. Both the initial state, the reset action,
 * and `isSectionOpen` read this list, so the three cannot drift.
 */
const DEFAULT_OPEN_SECTIONS = ['g-default', 'g-ai']

    /** Where the navigation preferences live. One key, one owner. */
    const NAV_CONFIG_KEY = 'dsh.productNav.config'

    /**
     * Navigation preferences, persisted so a reload keeps what the user set.
     *
     * Shape, all fields optional so an older payload stays readable:
     *   hiddenSections  group ids to leave out of the rail
     *   hiddenProducts  product ids to leave out of their group
     *   sectionLabels   group id → display name, overriding the dictionary
     *   sectionOrder    group ids in display order; unlisted groups keep the built-in order
     *   openSections    group ids expanded on load
     *
     * Read once per change and handed to the component as a snapshot, so the rail and the
     * settings page cannot disagree.
     */
    /**
   * 这个分组这一刻是否展开。
   *
   * 默认分组没有标题行可点，它的展开状态只来自配置页；出厂是展开。不能直接读
   * `openSections`——那是「默认展开的分组」列表，出厂值 `['g-ai']` 从不包含默认分组，
   * 直接读会让每次全新安装的默认分组都是收起的。
   *
   * 轨道与配置页共用这一个判定，两处显示才不会一个展开、一个显示未勾选。
   *
   * @param config - 已读出的导航配置。
   * @param sectionId - 分组 id。
   * @returns 是否展开。
   */
  /**
   * 这一刻要隐藏哪些产品行。
   *
   * 出厂语义是「只留本壳自带的行」：插件注册的产品一律先藏着，用户要哪个再自己打开。
   * 不能写成静态名单——不同部署装的 `dsh-product-*` 子集不同，写死会立刻过期；
   * 所以按规则还原：没存过就藏掉所有非内置行，存过就完全照存储（含空数组）。
   *
   * 「存过」要从原始配置判断，不能看解析结果：空数组是一个真实答案（全都显示），
   * 再按「没配置」推导会把用户的选择抹掉。
   *
   * @param config - 已读出的导航配置。
   * @param products - 当前已注册的产品行。
   * @returns 要隐藏的行 id。
   */
  function resolveHiddenProducts(config, products) {
    if (Array.isArray(config.hiddenProducts)) return config.hiddenProducts
    const builtIn = new Set(BUILT_IN_ROW_IDS)
    return products.map((entry) => String(entry.id)).filter((id) => !builtIn.has(id))
  }

  /**
   * Whether a group renders expanded.
   *
   * Two sources, in order: what the user configured, then the factory default.
   * The factory list is consulted only while the user has not touched the expand
   * settings — after that their choice is authoritative, including a choice that
   * closed a group the factory opens.
   *
   * Previously the factory branch was hardcoded to `g-default`, so every other
   * group — `g-ai` among them — was shut unless a saved config happened to
   * include it. That is why AI Harness arrived collapsed on a fresh install.
   *
   * @param config - the stored navigation preferences.
   * @param sectionId - group id being rendered.
   * @returns true when the group's rows are visible.
   */
  /**
   * 分组是否展开。
   *
   * openSections 是唯一依据：配置里有这个数组就照它，没有就是出厂名单。
   * 曾经这里对默认分组开了一个「未改动过即展开」的特例，副作用有两个：
   * 收起 AI Harness 会因为出厂名单里有它而立刻弹回；而任何一次展开/收起
   * 又会把这个特例一并关掉，默认分组随即收起——它没有标题行可点，用户再也
   * 找不回来。一个分组一套规则，这两个问题就都不存在了。
   *
   * @param config - 已读出的导航配置。
   * @param sectionId - 正在渲染的分组 id。
   * @returns 该分组的产品行是否可见。
   */
  function isSectionOpen(config, sectionId) {
    // 默认分组永远展开：它是无归属行的落点，而且没有标题行可点，收起它等于让那些行
    // 无处可去。配置里即使写着收起也不认。
    if (sectionId === DEFAULT_SECTION_ID) return true
    const open = Array.isArray(config.openSections) ? config.openSections : DEFAULT_OPEN_SECTIONS
    return open.includes(sectionId)
  }

  function readNavConfig() {
      try {
        const raw = window.localStorage.getItem(NAV_CONFIG_KEY)
        if (raw === null || raw === '') return {}
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return {}
        // 默认分组是落点，不允许隐藏在配置里。旧版本允许关掉它，升级后要顺手清掉，
        // 否则无归属的行没有去处。
        if (Array.isArray(parsed.hiddenSections) && parsed.hiddenSections.includes(DEFAULT_SECTION_ID)) {
          parsed.hiddenSections = parsed.hiddenSections.filter((id) => id !== DEFAULT_SECTION_ID)
        }
        // 默认分组恒展开，旧配置里记着「收起」也不该生效，顺手删掉这个无效条目。
        if (Array.isArray(parsed.openSections)) {
          parsed.openSections = parsed.openSections.filter((id) => id !== DEFAULT_SECTION_ID)
        }
        return parsed
      } catch {
        // A corrupt value must not take the rail down; fall back to the defaults.
        return {}
      }
    }

    /**
     * Write navigation preferences and notify listeners.
     * @param next - the full config to store.
     */
    function writeNavConfig(next) {
      try {
        window.localStorage.setItem(NAV_CONFIG_KEY, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (quota, private mode); the in-memory copy still applies.
      }
      // 先更新快照再通知：订阅者被唤醒时 getSnapshot 必须已经返回新值，
      // 否则 useSyncExternalStore 会读到旧对象而跳过这次渲染。
      navConfigSnapshot = next
      navConfigListeners.forEach((listener) => { listener() })
    }

    /** Listeners notified after a write; the component subscribes through `useSyncExternalStore`. */
    const navConfigListeners = new Set()

    /** Storage key: product ids whose right column was granted before the opt-in rule existed. */
    const LEGACY_COLUMN_KEY = 'dsh.productNav.legacyColumns'

    /**
     * Product ids allowed to keep a right column without opting in.
     *
     * `sidebar.columns` used to mean "give me a column". It now means "I have one available";
     * a product must also declare `sidebar.columns.visible` to actually get the space. Products
     * that only ever did the old thing would silently lose their column on upgrade -- and the
     * symptom, a navigation column that stops appearing, is harder to trace than the blank column
     * this rule exists to remove.
     *
     * The set is learned rather than hardcoded: every id seen with a `sidebar.columns`
     * registration is remembered, so whatever was working keeps working, and only ids that appear
     * for the first time after this version follow the new rule. Persisted because a product's
     * registration may not exist on the very load that upgrades the shell.
     */
    function readLegacyColumnIds() {
      try {
        const raw = window.localStorage.getItem(LEGACY_COLUMN_KEY)
        if (raw === null || raw === '') return new Set()
        const parsed = JSON.parse(raw)
        return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
      } catch {
        // A corrupt list must not take the rail down; an empty set only means new rule for all.
        return new Set()
      }
    }

    /** The legacy set, grown in place so callers see additions without re-reading storage. */
    const legacyColumnIds = readLegacyColumnIds()

    /**
     * Remember ids that registered a column, so they keep it.
     *
     * Only called for ids already present on the first load after this version ships, which is why
     * the caller passes what it saw: anything observed now has, by definition, been working under
     * the old rule.
     *
     * @param ids - column ids currently registered.
     */
    function rememberLegacyColumnIds(ids) {
      let added = false
      for (const id of ids) {
        if (legacyColumnIds.has(id)) continue
        legacyColumnIds.add(id)
        added = true
      }
      if (!added) return
      try {
        window.localStorage.setItem(LEGACY_COLUMN_KEY, JSON.stringify([...legacyColumnIds]))
      } catch {
        // Storage unavailable: the in-memory set still holds for this session.
      }
    }

    /**
     * Read the product rail's own collapsed flag.
     *
     * Separate from ui-layout's `collapsed`: that one means "the host hid the whole sidebar column",
     * this one means "the rail shows icons only". Folding them together would make the host's
     * collapse button and the brand row fight over one boolean.
     *
     * @returns true when the rail should render as an icon column.
     */
    function readRailCollapsed() {
      try {
        return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === '1'
      } catch {
        // A blocked store degrades to the expanded rail rather than breaking rendering.
        return false
      }
    }

    /**
     * Persist the product rail's collapsed flag.
     * @param collapsed - the new state.
     */
    function writeRailCollapsed(collapsed) {
      try {
        window.localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0')
      } catch {
        // Storage is best effort: the toggle still applies for this session.
      }
    }

    /** Subscribe to config changes. @returns the unsubscribe function. */
    function subscribeNavConfig(listener) {
      navConfigListeners.add(listener)
      return () => { navConfigListeners.delete(listener) }
    }

    /**
     * Current config for `useSyncExternalStore`.
     *
     * `getSnapshot` runs on every render and must not do IO: the previous version
     * called `localStorage.getItem` each time, which is a synchronous main-thread
     * read. The value is held here and refreshed by `writeNavConfig` and by the
     * `storage` event, so a read is just a field access.
     */
    let navConfigSnapshot
    function getNavConfigSnapshot() {
      navConfigSnapshot ??= readNavConfig()
      return navConfigSnapshot
    }

    /** Re-read storage, for the cross-window case and for a first-time mount. */
    function reloadNavConfigSnapshot() {
      navConfigSnapshot = readNavConfig()
      navConfigListeners.forEach((listener) => { listener() })
    }

    /**
     * Apply the stored order, labels and visibility to the built-in groups.
     *
     * The configuration page passes `includeHidden`, because a hidden group must still appear
     * there: the checkbox that would unhide it lives on that row, so filtering it out makes
     * hiding a one-way door. The rail passes the default and never sees hidden groups.
     *
     * @param config - navigation preferences.
     * @param t - dictionary lookup for the built-in labels.
     * @param includeHidden - keep groups the user hid, for the page that edits visibility.
     * @returns the groups to render, in display order.
     */
    function resolveSections(config, t, includeHidden = false) {
      // An absent list means "nothing has been configured yet", which is not the same as "show
      // everything": the factory default hides the business domains. An empty array is the
      // user's own choice to show them all, so it is honoured as-is.
      const hidden = Array.isArray(config.hiddenSections) ? config.hiddenSections : DEFAULT_HIDDEN_SECTIONS
      const labels = config.sectionLabels !== null && typeof config.sectionLabels === 'object' ? config.sectionLabels : {}
      const order = Array.isArray(config.sectionOrder) ? config.sectionOrder : []
      const custom = Array.isArray(config.customSections) ? config.customSections : []

      // Built-in groups plus any the user created. A custom group is just a name and an
      // id; it needs no slot because rows are arranged by this list, not by registration.
      const builtIn = SECTIONS.map((section) => ({
        id: section.id,
        labelKey: section.labelKey,
        slot: PRODUCT_SLOT,
        builtIn: true,
      }))
      const created = custom
        .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.id === 'string')
        .filter((entry) => !SECTIONS.some((section) => section.id === entry.id))
        .map((entry) => ({
          id: entry.id,
          // `label` is what every consumer reads — the rail draws it, the config page edits
          // it. Reporting the name under a different key (`customLabel`) left `section.label`
          // undefined, and because `labelKey` is null the row was then mistaken for the default
          // group: no title drawn, and its visibility / expand switches locked as if it were
          // the anchor. Carry the name under the key the readers actually use.
          label: typeof entry.label === 'string' ? entry.label : entry.id,
          labelKey: null,
          slot: PRODUCT_SLOT,
          builtIn: false,
        }))

      const all = [...builtIn, ...created]
      const visible = all.filter((section) => !hidden.includes(section.id))

      // Groups the stored order does not name keep their built-in position after the
      // ones it does, so adding a group in code never hides it behind a stale config.
      //
      // A group the stored order omits is placed by its built-in `order` relative to the
      // groups the stored order does name — otherwise a newly added group (开发域 g-code)
      // would land after every user-arranged group instead of where the manifest puts it.
      const rank = (section) => {
        const index = order.indexOf(section.id)
        if (index !== -1) return index
        // Count stored groups whose built-in order precedes this one, and place the new
        // group right after them. Unnamed groups keep their relative order among
        // themselves via their index in `all`.
        const builtInOrder = section.order ?? 0
        const preceding = order.filter((id) => {
          const other = all.find((entry) => entry.id === id)
          return other !== undefined && (other.order ?? 0) < builtInOrder
        }).length
        return preceding + order.length * 0 // keep the number stable for the sort below
      }

      // Sort by rank, with a tiebreak on the built-in order so two unnamed groups keep
      // the order the manifest declares.
      const position = (section) => {
        const index = order.indexOf(section.id)
        if (index !== -1) return index
        const builtInOrder = section.order ?? 0
        const preceding = order.filter((id) => {
          const other = all.find((entry) => entry.id === id)
          return other !== undefined && (other.order ?? 0) < builtInOrder
        }).length
        return preceding - 0.5
      }

      // The rail hides what the user hid; the configuration page keeps those rows so the
      // checkbox stays reachable.
      const shown = includeHidden ? all : visible

      return shown
        .slice()
        .sort((left, right) => position(left) - position(right) || (left.order ?? 0) - (right.order ?? 0))
        .map((section) => {
          const override = labels[section.id]
          const named = typeof override === 'string' && override !== ''
          // A custom group carries its own `label`; a built-in one resolves through the
          // dictionary. The anchor has a null `labelKey` and is the only group that ends with a
          // null label, which is what "draw no title" keys off.
          if (section.builtIn === false) {
            return { ...section, label: named ? override : section.label }
          }
          const built = section.labelKey === null ? null : t(section.labelKey)
          return { ...section, label: built === null ? null : (named ? override : built) }
        })
    }

    /**
     * Resolve which group each registered product row belongs to.
     *
     * The group is not part of a registration, so it comes from configuration with the
     * factory mapping as the default. A product the mapping has never heard of (a newly
     * installed plugin) lands in the first configured group rather than vanishing.
     * @param config - navigation preferences.
     * @param sections - groups currently rendered, in display order.
     * @param products - registered rows.
     * @returns the same rows, each carrying the group it should render under.
     */
    function resolveGrouping(config, sections, products) {
      const stored = config.productGroups !== null && typeof config.productGroups === 'object' ? config.productGroups : {}
      const ids = new Set(sections.map((section) => section.id))
      // A row whose group is absent goes to the default group (`g-default`, first in
      // `sections`) rather than a new group of its own. Navigation has no separate
      // "ungrouped" area: the default group is where rows without a business domain live,
      // and the rail appends them after the rows already there.
      // 落点固定是默认分组，按 id 取而不是取第一个：轨道传进来的是「可见分组」，
      // 旧配置若把默认分组标成隐藏，取第一个就会把无归属行塞进别的分组。
      const fallback = sections.length === 0
        ? null
        : (sections.find((section) => section.id === DEFAULT_SECTION_ID) ?? sections[0]).id
      /*
       * 出厂归属有三个来源，用户配置优先于全部：
       *
       *   stored            用户在导航配置页拖出来的归属
       *   DEFAULT_GROUP_OF  历史产品清单推导出的默认表
       *   SEEDS[].section   本壳自带行的出厂分组（更多、大肥鱼 DSH）
       *
       * 只查前两者时，自带行永远落到 fallback——它们不在那份历史清单里，于是
       * 每次渲染都被拉回默认分组，拖动写入的归属看起来完全不生效。
       *
       * SEEDS 在本函数被调用时早已初始化（模块求值先于任何渲染），直接读即可。
       */
      const seedSection = new Map(SEEDS.map((row) => [String(row.id), row.section]))
      const resolve = (id) => {
        const key = String(id)
        const assigned = typeof stored[key] === 'string'
          ? stored[key]
          : (DEFAULT_GROUP_OF[key] ?? seedSection.get(key))
        if (assigned !== undefined && ids.has(assigned)) return assigned
        return fallback
      }
      const ordered = products.map((entry) => ({ ...entry, section: resolve(entry.id) }))
      // 组内顺序：`productOrder` 记录用户拖出来的次序，没有记录的行排在后面（按注册顺序）。
      // 一份平铺的 id 列表而不是每组一份——归属已经在 productGroups 里，再存一份会分叉。
      const order = Array.isArray(config.productOrder) ? config.productOrder : []
      const rank = new Map()
      order.forEach((id, index) => { rank.set(String(id), index) })
      const far = Number.MAX_SAFE_INTEGER
      return ordered.sort((left, right) => {
        const a = rank.has(String(left.id)) ? rank.get(String(left.id)) : far
        const b = rank.has(String(right.id)) ? rank.get(String(right.id)) : far
        return a - b
      })
    }

    /**
     * The only rows the shell owns.
     *
     * Every business product now ships as its own plugin package and registers
     * its own row into a group slot; this shell no longer knows the product
     * list. What stays here is the one entry that is not a product page — the
     * DSH conversation panel — because selecting it clears the `main` panel and
     * hands the screen back to the native conversation, which only the shell
     * can arrange.
     *
     * `section` decides the group: the group *is* the slot, so the row lands in
     * `sidebar.products.g-ai` without any field travelling through the
     * registration options.
     */
    const SEEDS = [
      { id: CONVERSATION_ID, section: 'g-ai', order: 10, labelKey: 'dsh', glyph: GLYPH_COMPONENTS.dsh },
      {
        id: MORE_ROW_ID,
        section: 'g-default',
        // 排在组内最后，但不与产品抢 order 空间。
        order: Number.MAX_SAFE_INTEGER,
        labelKey: 'more.label',
        glyph: GLYPH_COMPONENTS.more,
        // 这里是内置行，但可显隐、可移动：BUILT_IN_ROW_IDS 只决定「恢复默认时默认显示」，
        // 不阻止用户在配置页把它关掉。分发是轨道 map 里的 id 比较。
      },
    ]

    /**
     * 导航配置页：分组与产品行的显示/命名/排序。
     *
     * 页面自己不做展示决策，只读写 `NAV_CONFIG_KEY`；轨道从同一份快照读，所以保存
     * 后左列立即跟着变，不需要重载。两处入口（设置面板、左下角页脚）都指向同一个
     * `main` key，看到的是同一页。
     *
     * @param props - 组合后的席位 props，携带 `useNavConfig` 与 `products`。
     * @returns 配置页。
     */
    /**
     * 导航配置页：分组与产品行的显示 / 命名 / 排序 / 归属。
     *
     * 页面自己不做展示决策，只读写 `NAV_CONFIG_KEY`；轨道从同一份快照读，所以保存后左列
     * 立即跟着变，不需要重载。两处入口（设置面板、左下角页脚）都指向同一个 `main` key。
     *
     * 分组行的结构：名称在上，组内产品标签紧排在名称下方，同一格内。此前成员藏在可展开的
     * 子行里，代价是①看成员要多点一次；②组与成员被拆成两个 `tr`，把产品拖到别的组时要从
     * 这一行拖到另一行；③子行离开视口后无从知道它属于哪个组。内联之后，拖出与落点在同一屏。
     *
     * @param props - `t` 取文案，`useProducts` 订阅产品行，`useNavConfig` 订阅配置快照。
     * @returns 分区表格。
     */
    function NavConfigPage(props) {
      const t = props.t
      const config = props.useNavConfig((value) => value)
      const products = typeof props.useProducts === 'function' ? props.useProducts((rows) => rows) : []
      // includeHidden: this page owns the visibility checkbox. Filtering hidden rows out here
      // would delete the only control that can bring a group back.
      const sections = resolveSections(config, t, true)
      const grouped = resolveGrouping(config, sections, products)
      const hiddenSections = Array.isArray(config.hiddenSections) ? config.hiddenSections : DEFAULT_HIDDEN_SECTIONS
      const hiddenProducts = resolveHiddenProducts(config, products)

      // 不再维护 openSections 的本地副本：展开状态唯一真相是 config.openSections，
      // 读用 isSectionOpen、写用 save({ openSections })。

      // 正在编辑名称的分组 id；null 表示没有行处于编辑态。
      const [editing, setEditing] = useState(null)
      const [draftLabel, setDraftLabel] = useState('')
      // 拖动中的分组 id、拖动中的产品 id，以及当前落点分组 id。
      const [dragging, setDragging] = useState(null)
      const [draggingProduct, setDraggingProductState] = useState(null)
      // 拖动中的产品同时写一份 ref：onDrop 与 onDragOver 可能在同一帧内到达，
      // 那时 useState 的值还是上一次的。落点判定只认这个同步值，不认异步 state。
      const draggingProductRef = useRef(null)
      const setDraggingProduct = (value) => {
        draggingProductRef.current = value
        setDraggingProductState(value)
      }
      // 多选的产品 id 集合：用于批量移动。拖动一次只能带一个，整理成批用这个。
      const [picked, setPicked] = useState(() => new Set())
      const [overRow, setOverRow] = useState(null)
      // 组内重排的落点：哪一枚标签、插在它前面还是后面。与 overRow（分组落点）互斥。
      const [overChip, setOverChip] = useState(null)
      // 同步镜像：drop 可能在同一帧内到达，那时 overChip 还是上一次的值。
      const overChipRef = useRef(null)
      // 是否停在尾部空白区（表示「放到最后」）。
      const [overTail, setOverTail] = useState(false)

      /** 写一份新的配置，字段整体替换而不是合并，避免删掉的项残留。 */
      const save = (patch) => { writeNavConfig({ ...readNavConfig(), ...patch }) }
      const orderIds = () => sections.map((section) => section.id)

      /**
       * 把 from 移到 to 当前占据的位置。
       *
       * 先移除再插入，所以 from 原本在 to 之前时，移除会让 to 左移一格，插入点要
       * 相应减一；不减的话一半的拖动组合都会多走一格（10/20 实测）。
       */
      const reorder = (from, to, side) => {
        if (from === null) return
        // 拖到自己身上：只有落在上半/下半的语义时才有意义，落点是自己则不动。
        if (to === from && side === undefined) return
        const order = orderIds()
        const source = order.indexOf(from)
        if (source === -1) return
        order.splice(source, 1)
        // 插入点按「移除 from 之后」的下标算，并且必须知道落点在哪一侧。
        //
        // 只给「插到 to 之前」这种说法在相邻行上会退化：to 恰好是 from 的下一行时，
        // 移除后 to 左移一格，插回它前面就是原位——拖动看起来完全没生效。
        // 所以侧别必须显式传入；to 为 null 表示追加到末尾。
        const at = to === null ? order.length : order.indexOf(to)
        if (at === -1) return
        order.splice(side === 'after' ? at + 1 : at, 0, from)
        save({ sectionOrder: order })
      }

      /** 新建分组：追加到末尾并立即进入改名态。 */
      const addGroup = () => {
        const id = 'g-custom-' + Date.now().toString(36)
        const custom = Array.isArray(config.customSections) ? config.customSections : []
        // 新分组默认收起。建组这一步的直接目的是给它起名，改名态就在轨道标题上，
        // 收起不影响这一步；展开与否交给用户点标题决定，免得空分组把轨道撑长。
        const open = Array.isArray(config.openSections) ? config.openSections : []
        save({
          customSections: [...custom, { id, label: t('config.unnamed') }],
          sectionOrder: [...orderIds(), id],
          openSections: open.filter((openId) => openId !== id),
        })
        setEditing(id)
        setDraftLabel(t('config.unnamed'))
      }

      /** 提交改名：空值回退到原名，不留空标题。 */
      const commitLabel = (id) => {
        const value = draftLabel.trim()
        const labels = { ...(config.sectionLabels ?? {}) }
        if (value === '') delete labels[id]
        else labels[id] = value
        setEditing(null)
        save({ sectionLabels: labels })
      }

      /**
       * 删除分组：组内产品并入默认分组，产品不会凭空消失。
       *
       * 默认分组是「没有业务域归属」的落点，产品追加在它已有的行之后。
       */
      const removeGroup = (id) => {
        // 默认分组不可删：没有业务域归属的产品靠它安身。
        if (id === 'g-default') return
        if (sections.length <= 1) return
        if (!window.confirm(t('config.removeConfirm'))) return
        const remaining = orderIds().filter((entry) => entry !== id)
        const custom = (Array.isArray(config.customSections) ? config.customSections : [])
          .filter((entry) => entry !== null && typeof entry === 'object' && entry.id !== id)
        const stored = { ...(config.productGroups ?? {}) }
        for (const product of grouped) {
          if (product.section === id) stored[product.id] = 'g-default'
        }
        save({ customSections: custom, sectionOrder: remaining, productGroups: stored })
      }

      /**
       * 把产品移到别的分组。
       *
       * 跨组时不改 productOrder：那一列存的是组内次序，跨组后它在新组里仍然是「排在那几行
       * 之后」，因为排序只比较同一目标组里的行。
       * @param productId - 被移动的行。
       * @param toSection - 目标分组。
       */
      const moveProduct = (productId, toSection) => {
        const stored = { ...(config.productGroups ?? {}) }
        stored[productId] = toSection
        // 归属变了，但同时把顺序补全：只改归属不碰顺序时，若这一行原本不在
        // productOrder 里，它会在新组的末尾再按注册顺序落位，看起来「位置不对」。
        save({ productGroups: stored, productOrder: fullOrder() })
      }

      /**
       * 组内重排：把 from 插到 to 的前面或后面。
       *
       * 先把当前可见顺序读成一份 id 列表（含未记录过位置的行，它们按注册顺序排在末尾），
       * 再按「先移除、后插入」改写，最后整份写回。这样做的好处是不需要为未排序的行猜位置。
       * @param from - 被拖动的产品 id。
       * @param to - 落点产品 id。
       * @param position - before 插到它前面，after 插到它后面。
       */
      /**
       * The complete row order, for rewriting `productOrder`.
       *
       * Starts from the stored order and appends any row it does not mention,
       * following the order those rows currently render in. Writing a list that
       * omits a row makes that row sink to the end (the sort treats a missing id
       * as MAX_SAFE_INTEGER), which is how 「更多」 kept losing its position.
       *
       * @returns every known row id exactly once.
       */
      const fullOrder = () => {
        const stored = Array.isArray(config.productOrder) ? config.productOrder : []
        const known = grouped.map((entry) => String(entry.id))
        const seen = new Set()
        const out = []
        for (const id of stored) {
          const key = String(id)
          // 丢弃已经不存在的行，避免越积越长的僵尸 id。
          if (!known.includes(key) || seen.has(key)) continue
          seen.add(key)
          out.push(key)
        }
        for (const id of known) {
          if (seen.has(id)) continue
          seen.add(id)
          out.push(id)
        }
        return out
      }

      const reorderProduct = (from, to, position) => {
        if (from === null || to === null || from === to) return
        // 以完整顺序为基准改写：漏掉任何一行，那一行就会沉到末尾
        // （排序把缺失的 id 当作 MAX_SAFE_INTEGER）。
        const current = fullOrder()
        const key = String(from)
        if (!current.includes(key)) current.push(key)
        if (!current.includes(String(to))) return
        const source = current.indexOf(key)
        current.splice(source, 1)
        // 重新读取 to 的下标：移除 from 之后它可能已经左移。
        const at = current.indexOf(String(to))
        if (at === -1) return
        current.splice(position === 'after' ? at + 1 : at, 0, key)
        save({ productOrder: current })
      }

      /**
       * 组内的产品标签：勾选显隐、可拖到别的分组。
       *
       * 没有产品时给一行说明而不是留白：空格子分不清「这组没东西」和「渲染坏了」。
       * @param items - 本组的产品行。
       * @returns 标签容器。
       */
      /**
       * 组内产品标签：勾选显隐、可拖到别的分组、可在组内换位。
       *
       * 三种拖动手势：拖到同组另一枚标签上换位；拖到末尾空白区放到最后；拖到别的分组改归属。
       * 尾部落点必须有：最后一枚标签右侧不属于任何标签，落点会冒泡到组行被当成「改归属」，
       * 而目标本来就是同一组，于是什么都不会发生。
       * @param items - 本组的产品行。
       * @returns 标签容器。
       */
      /**
       * 组内产品标签。
       *
       * @param items - 该分组的产品行；为空时渲染占位块。
       * @param onDropInto - 空组接住拖动时的回调，用来把行归到这个分组。
       * @returns 标签容器。
       */
      const chipList = (items, onDropInto) => {
        if (items.length === 0) {
          // 空分组同样要能接住拖来的行，否则新建的分组永远拖不进去——它没有标签
          // 可以当落点，组行自己的 onDrop 又被这块占位盖住。
          return h('div', {
            className: 'pn-chips pn-chips-empty',
            // 阻止冒泡：由本块接住并明确处理，避免与组行的落点重复计算。
            onDragOver: (event) => {
              if (draggingProductRef.current === null) return
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'move'
              if (overTail) setOverTail(false)
              if (overChip !== null) setOverChip(null)
              overChipRef.current = null
            },
            onDrop: (event) => {
              const dragging = draggingProductRef.current
              if (dragging === null || onDropInto === undefined) return
              event.preventDefault()
              event.stopPropagation()
              onDropInto(dragging)
              setDraggingProduct(null)
              setOverRow(null)
              setOverChip(null)
              setOverTail(false)
              overChipRef.current = null
            },
          }, t('config.noProducts'))
        }
        return h('div', { className: 'pn-chips' },
          items.map((entry) => {
            // 内置行与插件注册的行同等对待：都能显隐、都能移动。它们的目的地都还有别的入口
            // （logo 行切回原生会话、页脚的插件管理新建插件），所以隐藏是一种偏好，不是死路。
            const isOff = hiddenProducts.includes(entry.id)
            const chipClass = ['pn-chip']
            if (isOff) chipClass.push('is-off')
            if (draggingProduct === entry.id) chipClass.push('is-dragging')
            if (overChip !== null && overChip.id === entry.id && draggingProduct !== entry.id) {
              chipClass.push(overChip.position === 'before' ? 'is-drop-before' : 'is-drop-after')
            }
            // 容器用 div，不用 label：label 会在任意点击时激活内部复选框，
            // 于是「拖动」与「选中」都会顺手切换显隐。复选框自己保留点击区，
            // 拖动与选中各由手柄、文字承担。
            return h('div', {
              key: entry.id,
              className: chipClass.join(' '),
              // div 没有隐式拖动能力，这个属性是必需的（label 改为 div 时漏带过一次）。
              draggable: true,
              title: t('config.chipHint'),
              onClick: (event) => {
                if (event.target instanceof HTMLInputElement) return
                setPicked((current) => {
                  const next = new Set(current)
                  if (next.has(entry.id)) next.delete(entry.id)
                  else next.add(entry.id)
                  return next
                })
              },
              onDragStart: (event) => {
                event.stopPropagation()
                // 产品拖动单独记录，落点时据此区分「改归属」与「排序分组」。
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', 'product:' + entry.id)
                setDraggingProduct(entry.id)
              },
              onDragEnd: () => {
                setDraggingProduct(null)
                setOverRow(null)
                setOverChip(null)
                setOverTail(false)
                overChipRef.current = null
              },
              // 落在另一枚标签上 = 组内重排。组行上的落点由 tr 的 onDrop 处理（改归属）。
              onDragOver: (event) => {
                // 读 ref，不读 state：setDraggingProduct 要下一个 tick 才生效，首帧拿到
                // null 就会在 preventDefault 之前返回，浏览器因此不认这是可落点，
                // 随后的 drop 根本不会触发——「跨一个不行、跨几个却行」就是这么来的。
                const dragged = draggingProductRef.current
                if (dragged === null || dragged === entry.id) return
                // 阻止冒泡，否则会同时触发组行的「改归属」落点。
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
                const rect = event.currentTarget.getBoundingClientRect()
                const position = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
                // ref 与 state 同步写入：drop 可能在同一帧内到达，那时 state 还是上一次的值。
                overChipRef.current = { id: entry.id, position }
                if (overChip === null || overChip.id !== entry.id || overChip.position !== position) {
                  setOverChip({ id: entry.id, position })
                }
                if (overTail) setOverTail(false)
                // 进入标签就离开行体：不清掉 overRow 的话整行高亮会一直留着。
                if (overRow !== null) setOverRow(null)
              },
              onDrop: (event) => {
                const dragging = draggingProductRef.current
                if (dragging === null) return
                event.preventDefault()
                event.stopPropagation()
                // 跨组落到标签上时，先改归属再排位。目标组由 onDropInto 传入——
                // chipList 定义在 row 之前，作用域里没有 section。
                if (onDropInto !== undefined) onDropInto(dragging)
                const live = overChipRef.current
                const position = live !== null && live.id === entry.id ? live.position : 'before'
                reorderProduct(dragging, entry.id, position)
                setDraggingProduct(null)
                setOverChip(null)
                setOverRow(null)
                setOverTail(false)
                overChipRef.current = null
              },
            },
            // 六点手柄：与分组行的拖动柄同形，让「这个能拖」不用读说明也知道。
            h('span', { className: 'pn-chip-grip', 'aria-hidden': 'true' }, '⠿'),
            h('input', {
              type: 'checkbox',
              checked: !isOff,
              // 复选框自己的点击不该冒泡到容器的选中逻辑；也不该被当作拖动起点。
              onClick: (event) => { event.stopPropagation() },
              onMouseDown: (event) => { event.stopPropagation() },
              onChange: (event) => {
                const next = event.target.checked
                  ? hiddenProducts.filter((id) => id !== entry.id)
                  : [...hiddenProducts, entry.id]
                save({ hiddenProducts: next })
              },
            }),
            h('span', { className: 'pn-chip-label' }, entry.label))
          }),
          // 尾部落点：拖到最后一枚标签右边的空白区，表示「放到最后」。
          h('div', {
            key: '__tail__',
            className: overTail ? 'pn-chips-tail is-over' : 'pn-chips-tail',
            onDragOver: (event) => {
              if (draggingProductRef.current === null) return
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'move'
              overChipRef.current = null
              if (overChip !== null) setOverChip(null)
              if (!overTail) setOverTail(true)
              // 同理：进入尾部落点也要撤掉行体高亮。
              if (overRow !== null) setOverRow(null)
            },
            onDragLeave: () => { if (overTail) setOverTail(false) },
            onDrop: (event) => {
              const dragging = draggingProductRef.current
              if (dragging === null) return
              event.preventDefault()
              event.stopPropagation()
              // 同标签落点：先归到本组，再排到最后。目标组同样由 onDropInto 传入。
              if (onDropInto !== undefined) onDropInto(dragging)
              // items 是本次渲染的旧切片，不含刚拖来的行：先把它补进去再排位，
              // 否则第一次拖放进来的位置是按「没有这一行」的列表算的，要拖第二次才对。
              const from = String(dragging)
              const list = items.map((row) => String(row.id))
              if (!list.includes(from)) list.push(from)
              const rest = list.filter((id) => id !== from)
              if (rest.length > 0) reorderProduct(from, rest[rest.length - 1], 'after')
              setDraggingProduct(null)
              setOverChip(null)
              setOverRow(null)
              setOverTail(false)
              overChipRef.current = null
            },
          })
        )
      }

      /** 一行一个分组：拖动排序、双击改名，组内标签排在「产品导航」列。 */
      const row = (section, index) => {
        // Identify the anchor by id, not by `labelKey`: a user-created group also has a null
        // `labelKey`, and keying off that made every custom group behave like the anchor.
        const isDefault = section.id === 'g-default'
        const hidden = hiddenSections.includes(section.id)
        const items = grouped.filter((entry) => entry.section === section.id)
        const isEditing = editing === section.id
        const rowClass = ['pn-row']
        if (dragging === section.id) rowClass.push('is-dragging')
        // 两种拖动问的问题不同，落点提示也必须不同：
        //
        //   分组排序  「插到哪一格」→ 行上沿/下沿画插入线，光标在上半还是下半决定 before/after
        //   产品改归属「归到哪一组」→ 整行就是目标，整行描边；画插入线等于说
        //                            「在这行上面插一个分组」，与实际发生的事不符
        const isGroupDrag = dragging !== null && dragging !== section.id
        const isProductDrag = draggingProduct !== null
        if (overRow !== null && overRow.id === section.id) {
          if (isProductDrag) {
            rowClass.push('is-drop-into')
          } else if (isGroupDrag) {
            rowClass.push(overRow.position === 'before' ? 'is-drop-before' : 'is-drop-after')
          }
        }

        /** 光标落在本行的上半还是下半。 */
        const positionIn = (event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        }

        return h('tr', {
          key: section.id,
          className: rowClass.join(' '),
          onDragOver: (event) => {
            // 两种拖动都接受：分组（排序）与产品（改归属）。
            // 一律读 ref——useState 慢一格，首帧读到 null 会让守卫失效、
            // 于是整行点亮后没人清掉，表现为「拖完还留着高亮」。
            const productDrag = draggingProductRef.current !== null
            if (dragging === null && !productDrag) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            // 停在标签或尾部时由它们自己处理，组行不该同时整行点亮成「改归属」。
            if (productDrag && (overChip !== null || overTail)) return
            const position = productDrag ? 'into' : positionIn(event)
            if (overRow === null || overRow.id !== section.id || overRow.position !== position) {
              setOverRow({ id: section.id, position })
            }
          },
          onDragLeave: (event) => {
            // 拖动过程中 relatedTarget 通常是 null，用 contains 判断会漏掉清理，
            // 高亮就留在原地。改成「只要离开本行就清」。
            const to = event.relatedTarget
            if (to !== null && event.currentTarget.contains(to)) return
            setOverRow((current) => (current !== null && current.id === section.id ? null : current))
          },
          onDrop: (event) => {
            event.preventDefault()
            if (draggingProductRef.current !== null) {
              moveProduct(draggingProductRef.current, section.id)
            } else if (dragging !== null) {
              // 直接把落点与侧别交给 reorder：末行下半用 null 表示追加。
              const side = positionIn(event)
              if (side === 'after' && sections[index + 1] === undefined) {
                reorder(dragging, null, 'after')
              } else {
                reorder(dragging, section.id, side)
              }
            }
            setDragging(null)
            setDraggingProduct(null)
            setOverRow(null)
          },
        },
        // 拖动手柄列
        h('td', {
          className: 'pn-cell-handle',
          // 拖动能力挂在整格上，而不是那个 14px 的字形：热区从字形扩到 40×40，
          // 鼠标偏几像素也仍在格内，不会落到名称列变成选中文字。
          draggable: true,
          title: t('config.dragHint'),
          onDragStart: (event) => {
            setDragging(section.id)
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', section.id)
          },
          onDragEnd: () => { setDragging(null); setOverRow(null) },
        },
        h('span', { className: 'pn-handle', 'aria-hidden': 'true' }, '⠿')),
        // 名称列：只放分组名与改名入口。
        h('td', { className: 'pn-cell-name' },
          isEditing
            ? h('input', {
              className: 'pn-name-input',
              type: 'text',
              value: draftLabel,
              autoFocus: true,
              'aria-label': t('config.rename'),
              onChange: (event) => { setDraftLabel(event.target.value) },
              onBlur: () => { commitLabel(section.id) },
              onKeyDown: (event) => {
                if (event.key === 'Enter') commitLabel(section.id)
                if (event.key === 'Escape') setEditing(null)
              },
            })
            : h('span', { className: 'pn-name-wrap' },
              h('span', {
                className: isDefault ? 'pn-name pn-name-muted' : 'pn-name',
                title: isDefault ? t('config.cannotRename') : t('config.renameHint'),
                onDoubleClick: () => {
                  if (isDefault) return
                  setEditing(section.id)
                  setDraftLabel(section.label ?? '')
                },
                // Only the anchor falls back to "默认分组". Every other group must show its own
                // name: a custom group with a null label used to inherit this fallback and
                // appear as a second 「默认分组」, which reads as duplicated data, not a bug.
              }, section.label ?? (isDefault ? t('config.defaultGroup') : section.id)),
              // 改名入口：名称后面一支铅笔。此前只有双击名称，没有任何可见提示。
              isDefault
                ? null
                : h('button', {
                  type: 'button',
                  className: 'pn-rename',
                  'aria-label': t('config.rename'),
                  title: t('config.rename'),
                  onClick: () => {
                    setEditing(section.id)
                    setDraftLabel(section.label ?? '')
                  },
                }, h('svg', {
                  viewBox: '0 0 24 24', width: '12', height: '12',
                  fill: 'none', stroke: 'currentColor', strokeWidth: '1.8',
                  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
                }, h('path', { d: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z' }))))),
        // 这一列就叫「产品导航」，组内的行就排在这里。数字与批量按钮已去掉：标签直接可见，
        // 数量就是标签个数；批量按钮原本服务的是折叠态，而折叠态已不存在。
        h('td', { className: 'pn-cell-count pn-cell-chips' },
          chipList(items, (productId) => { moveProduct(productId, section.id) })),
        // 状态列：分组显示 / 隐藏
        //
        // 默认分组固定显示且不可关：它是所有无归属行的落点，注册不规范的子产品也落到
        // 这里。允许隐藏它，那些行就没有去处了。开关保持可见但禁用，并写明原因——
        // 直接不渲染会让人以为这一格坏了。
        h('td', { className: 'pn-cell-state' },
          h('label', { className: 'pn-switch' },
            h('input', {
              type: 'checkbox',
              checked: isDefault ? true : !hidden,
              disabled: isDefault,
              title: isDefault ? t('config.defaultAlwaysShown') : undefined,
              onChange: (event) => {
                if (isDefault) return
                const next = event.target.checked
                  ? hiddenSections.filter((id) => id !== section.id)
                  : [...hiddenSections, section.id]
                save({ hiddenSections: next })
              },
            }),
            h('span', { className: 'pn-switch-text' },
              isDefault
                ? t('config.visible')
                : (hidden ? t('config.hidden') : t('config.visible'))))),
        // 默认展开列
        h('td', { className: 'pn-cell-open' },
          h('label', { className: 'pn-switch' },
            h('input', {
              type: 'checkbox',
              // 与轨道共用同一个判定：读配置，不读本地副本。
              checked: isSectionOpen(config, section.id),
              // 默认分组恒展开且没有标题行，收起它没有意义，因此锁死。
              disabled: isDefault,
              title: isDefault ? t('config.defaultAlwaysShown') : undefined,
              onChange: (event) => {
                if (isDefault) return
                const checked = event.target.checked
                const listed = Array.isArray(config.openSections) ? config.openSections : []
                const next = checked
                  ? [...listed.filter((id) => id !== section.id), section.id]
                  : listed.filter((id) => id !== section.id)
                save({ openSections: next })
              },
            }),
            h('span', { className: 'pn-switch-text' },
              isSectionOpen(config, section.id) ? t('config.open') : t('config.openProducts')))),
        // 操作列：删除（默认分组没有）
        h('td', { className: 'pn-cell-actions' },
          isDefault
            ? h('span', { className: 'pn-actions-placeholder' })
            : h('button', {
              type: 'button',
              className: 'pn-link pn-link-danger',
              onClick: () => { removeGroup(section.id) },
              title: t('config.remove'),
            }, t('config.remove')))
        )
      }

      const totalProducts = grouped.length

      return h('div', { className: 'pn-cfg' },
        // 页头：标题 + 主操作（主操作永远在页头右侧）
        h('div', { className: 'pn-cfg-head' },
          h('div', {},
            h('div', { className: 'pn-cfg-title' }, t('config.title')),
            h('div', { className: 'pn-cfg-sub' }, t('config.subtitle'))),
          h('div', { className: 'pn-cfg-actions' },
            h('button', { type: 'button', className: 'pn-btn pn-btn-primary', onClick: () => { addGroup() } },
              t('config.add')),
            h('button', { type: 'button', className: 'pn-btn', onClick: () => {
              // 写回出厂配置，而不是写一个空对象。
              //
              // `{}` 让每个字段回落到各自的默认：`hiddenSections` 回落到
              // DEFAULT_HIDDEN_SECTIONS，所以观感上确实「恢复了」。但它同时抹掉用户点过这
              // 个按钮的痕迹——配置里看不出「这是我恢复过的状态」还是「我什么都没设过」。
              // 写入具体值让两侧一致：点完之后配置里就是出厂那份隐藏列表。
              // 恢复默认 = 只剩本壳自带的行。插件注册的产品一律隐藏，用户要哪个再自己打开。
              // 写成当前已注册的行，而不是静态名单：重置那一刻装了什么就藏什么。
              const builtIn = new Set(BUILT_IN_ROW_IDS)
              const productRows = products
                .map((entry) => String(entry.id))
                .filter((id) => !builtIn.has(id))
              // 恢复默认要把「用户自己加过的东西」一起清掉，不能只覆盖隐藏与展开：
              // customSections（新建的分组）、sectionLabels（改过的名字）、
              // sectionOrder（拖过的顺序）、productGroups 与 productOrder（拖过的归属）
              // 都是用户的选择，留着它们就不是出厂状态——点名过的现象是重置后
              // 仍有一个「新分组」挂在表格里。
              //
              // 因此这里写的是完整的一份，而不是与旧配置合并：没有列出的键就是没有。
              writeNavConfig({
                hiddenSections: DEFAULT_HIDDEN_SECTIONS,
                hiddenProducts: productRows,
                openSections: DEFAULT_OPEN_SECTIONS,
                customSections: [],
                sectionLabels: {},
                sectionOrder: [],
                productGroups: {},
                productOrder: [],
              })
              setEditing(null)
            } }, t('config.reset')))),
        // 表格：每行一张白卡
        h('table', { className: 'pn-table' },
          h('thead', {}, h('tr', {},
            h('th', {}),
            h('th', {}, t('config.colName')),
            h('th', { className: 'pn-cell-count' }, t('config.colCount')),
            h('th', { className: 'pn-cell-state' }, t('config.colVisible')),
            h('th', { className: 'pn-cell-open' }, t('config.colOpen')),
            h('th', { className: 'pn-cell-actions' }, t('config.colActions')))),
          h('tbody', {}, sections.map((section, index) => row(section, index)))),
        // 底部计数与操作提示
        h('div', { className: 'pn-cfg-foot' },
          h('span', {}, t('config.summary'), ' ', String(sections.length), ' · ', t('config.summaryProducts'), ' ', String(totalProducts)),
          h('span', { className: 'pn-cfg-tip' }, t('config.dragHint'))))
    }




    /**
     * `sidebar` 席位的占据者：产品导航 + 当前产品自己的导航列。
     * @param props - 组合后的席位 props（列状态、hooks、语言、注入面）。
     * @returns 两段式左列。
     */
    /** 手势连续性阈值：间隔小于此值的滚轮事件属于同一次手势（含惯性段）。 */
    const GESTURE_GAP_MS = 100

    /**
     * 垂直滚动的像素距离；捏合缩放与以横向为主的事件返回 undefined，交回原生。
     * @param event - 滚轮事件。
     * @param page - 视口高度，用于按页滚动的换算。
     * @returns 垂直像素数，或 undefined。
     */
    function verticalWheelPixels(event, page) {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return undefined
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * page
      return event.deltaY
    }

    /**
     * 按 delta 滚动；浏览器夹取写入值，返回实际移动距离。
     * @param element - 滚动元素。
     * @param delta - 期望位移。
     * @returns 实际位移。
     */
    function scrollClamped(element, delta) {
      const before = element.scrollTop
      element.scrollTop = before + delta
      return element.scrollTop - before
    }

    /**
     * 视口是否已把导航滚走；亚像素余量算到底。
     * @param viewport - 视口元素。
     * @returns 是否到底。
     */
    function atEnd(viewport) {
      return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 1
    }

    /**
     * 滚轮交接器（照抄原生 `createScrollHandoff`，去掉类型标注）。
     *
     * 这一步只用它产出的 `useSectionScroller`：取用方通过 `bindScrollerRef` 绑自己的列表
     * 元素，列表照原生滚动。搬走导航的那半个行为需要把整列包进视口，另行处理。
     *
     * @returns 视口 ref 回调与取用方 hook，两者身份稳定。
     */
    function createScrollHandoff() {
      let scroller = null
      let releaseViewport
      let lastSplit = Number.NEGATIVE_INFINITY
      /**
       * 把一个滚轮位移按需拆给视口与区段。
       * @param viewport - 视口元素。
       * @param event - 滚轮事件。
       */
      const handle = (viewport, event) => {
        if (scroller === null || event.defaultPrevented) return
        const delta = verticalWheelPixels(event, viewport.clientHeight)
        if (delta === undefined || delta === 0) return
        const continuing = event.cancelable && event.timeStamp - lastSplit < GESTURE_GAP_MS
        if (!continuing) {
          const native = atEnd(viewport) && scroller.contains(event.target)
          if (native && (delta > 0 || scroller.scrollTop + delta >= 0)) return
          if (!event.cancelable) {
            if (native) scrollClamped(viewport, delta + scroller.scrollTop)
            return
          }
        }
        event.preventDefault()
        lastSplit = event.timeStamp
        if (delta > 0) {
          const rest = delta - scrollClamped(viewport, delta)
          if (rest > 0) scrollClamped(scroller, rest)
          return
        }
        const rest = delta - scrollClamped(scroller, delta)
        if (rest < 0) scrollClamped(viewport, rest)
      }
      // 区段自己的滚动元素由取用方绑回来；未绑定前 handle 直接返回。
      const sectionScroller = { bindScrollerRef: (element) => { scroller = element } }
      return {
        bindViewportRef: (element) => {
          if (releaseViewport !== undefined) releaseViewport()
          releaseViewport = undefined
          if (element === null) return
          const onWheel = (event) => { handle(element, event) }
          element.addEventListener("wheel", onWheel, { passive: false })
          releaseViewport = () => { element.removeEventListener("wheel", onWheel) }
        },
        useSectionScroller: () => sectionScroller,
      }
    }

    /**
     * `sidebar.workspaces` 的槽位级 hook 工厂（照抄原生 `SIDEBAR_SECTION_INJECT`）。
     *
     * 把每次渲染随 `hookContext` 递进来的 `useSectionScroller` 原样转给取用方。
     * 它与渲染时的 `hookContext` 是一对，只给一边，取用方拿到的就是 undefined。
     */
    const SIDEBAR_SECTION_INJECT = {
      hooks: { sectionScroller: (_standard, { useSectionScroller }) => useSectionScroller },
    }


    function ProductSidebar(props) {
      const { collapsed, drawer, renderSlot, renderFactorySlot, t, menuEntries, setPinnedRow, openPluginList, createPlugin, createNavPlugin } = props
      // 桌面端标记由 preload 设置，最晚在 DOMContentLoaded 才到，所以每次渲染都读。
      const darwinDesktop = typeof document !== 'undefined'
        && document.documentElement.dataset.platform === 'darwin'
      const wide = drawer || !collapsed
      // 产品轨自己的折叠态：只收窄产品轨，不折叠 DSH 的整列。两者是独立的轴，
      // 合成一个布尔值会让 DSH 的折叠按钮和 logo 行抢同一个状态。
      const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed)
      const toggleRailCollapsed = () => {
        setRailCollapsed((current) => {
          writeRailCollapsed(!current)
          return !current
        })
      }
      const activePanel = props.usePanelInfo((info) => info.activePanelId)
      // 惰性初始化：交接器身份必须稳定，否则每次渲染都会换一个 scroller 对象。
      const scrollHandoff = useState(createScrollHandoff)[0]
      // 产品轨自己的折叠态：只收窄产品轨，不折叠 DSH 的整列。两者是独立的轴，
      // 合成一个布尔值会让 DSH 的折叠按钮和 logo 行抢同一个状态。
      // 两列宽度：产品导航固定 RAIL_FIXED_WIDTH，右列吃掉整列剩下的部分。
      //
      // 不按 `props.width` 做比例分配，也不提供拖拽。ui-layout 默认列宽 280、
      // 上限 420；曾经的「按预算缩放 + 可拖」让产品导航被压到 95~148px，产品
      // 列表缩成一行图标。固定宽度是唯一稳定的行为。
      const columnPx = typeof props.width === 'number' && props.width > 0 ? props.width : SIDEBAR_MAX_WIDTH
      // 产品轨宽度是设计常量，**不读 columnPx**。
      //
      // columnPx 是 ui-layout 对「我们钉下的轨道」的回报，再拿它算 railPx 就是循环依赖：
      // 收起时钉 296 → 宿主回报 296 → 展开时仍按 296 推算，产品轨回不到 180，标签一直截断，
      // 点 logo 也看不出变化（两个状态都被压窄）。
      //
      // 这一列占多宽由本壳决定：展开 180、收起 56。收起/展开沿用同一组常量，不采信中间帧。
      const railPx = wide && !railCollapsed ? RAIL_FIXED_WIDTH : RAIL_COLLAPSED_WIDTH
      const narrowRail = railPx === RAIL_COLLAPSED_WIDTH
      // 导航列同样是常量：两列合计 420 = SIDEBAR_MAX_WIDTH，与要拉到的列宽一致。
      const navPx = wide ? Math.max(0, SIDEBAR_MAX_WIDTH - RAIL_FIXED_WIDTH) : 0

      // 轨道要钉多宽由分支决定，所以两个宽度都交给 hook：
      //   单列分支（data-solo）只有产品轨   → railPx
      //   两列分支            产品轨 + 导航列 → railPx + navPx，恒等于 columnPx
      // 分支判定放在 hook 里做，调用本身保持无条件，hook 顺序稳定。
      const attachSolo = useSoloTrack(railPx, navPx, columnPx)

      // 注入的 hooks 由渲染器从 `hooks` 分区绑定；缺失时降级为空列表，不能整列崩。
      const products = typeof props.useProducts === 'function' ? props.useProducts((rows) => rows) : []
      const panels = typeof props.usePanels === 'function' ? props.usePanels((rows) => rows) : []
      const contentKeys = typeof props.useContentKeys === 'function' ? props.useContentKeys((rows) => rows) : []

      // 产品轨的选中项。**不能只信 `activePanel`**：`ui-layout.selectPanel` 在
      // target key 未注册时抛错并保留旧选择，而产品包的 main 注册并不保证成功
      // （包可能加载失败）。只读 `activePanel` 的话，点工作台后它仍是 null，一切判断都落回
      // 「当前是 DSH 会话」，右列自然不会隐藏——这正是反复修不好的原因。
      //
      // 规则：本地记录用户点了哪个产品；`activePanel` 变成 DSH 自己的面板时
      // 以它为准（那是中间内容真的切了），其余情况沿用本地选中项。
      const [pickedRail, setPickedRail] = useState(null)
      const isDshPanelActive = activePanel !== null && panels.some((panel) => panel.id === activePanel)
      // 兜底值决定「这一帧要不要右列」。`panels` 是异步投影，首帧为空，
      // 用 CONVERSATION_ID 兜底会让刚切到产品的这一帧误判成对话态：右列
      // 出现又消失，视觉上就是列边界跳一下。首帧没有选中项时按 solo 处理，
      // 因为绝大多数产品不要右列，先收窄再展开比先展开再收窄稳。
      const activeId = isDshPanelActive
        ? activePanel
        : (pickedRail ?? activePanel ?? (panels.length === 0 ? null : CONVERSATION_ID))
      // 产品轨的选中项是**另一个问题**，不能复用 activeId：
      //
      //   activeId 答「第二列属于谁」，会跟着 activePanel 走；
      //   railId  答「产品轨该高亮谁」，必须停在用户点过的那一行。
      //
      // 两者合一时，选中大肥鱼再点它第二列里的任意一行，activePanel 变成那个面板 id，
      // activeId 随之塌成面板 id，产品行拿 `activeId === entry.id` 去比——产品 id 对面板 id
      // 永不相等，于是轨道高亮和面板高亮一起消失。
      //
      // pickedRail 为空时按 activeId 兜底，但排除面板 id——面板不是轨道里的一行。
      // 刷新后落在会话态会高亮大肥鱼，落在某个产品页会高亮那个产品。
      const railId = pickedRail !== null
        ? pickedRail
        : (isDshPanelActive ? null : activeId)
      const hasOwnNav = contentKeys.includes(activeId)
      // 插件诉求：这条产品声明了要右列才显示。与 `hasOwnNav`（有没有注册
      // 内容）是两个独立事实，壳只按诉求决定，不替产品推断。
      const columnIds = typeof props.useColumnIds === 'function' ? props.useColumnIds((rows) => rows) : []
      const wantsColumn = (id) => id === CONVERSATION_ID || columnIds.includes(id)

      // 导航偏好：配置页写、轨道读，两边共用同一份快照。
      const navConfig = props.useNavConfig((config) => config)

      // 分组收展不设本地副本：唯一真相是 navConfig.openSections，读走
      // isSectionOpen、写走 writeNavConfig。此前这里另有一份 useState，出厂值还是
      // ['g-ai']，与 DEFAULT_OPEN_SECTIONS 不一致，两个入口因此会显示不同的勾选。
      /**
       * 切换一个分组的展开状态。
       *
       * 必须同时写回配置：渲染读的是 `isSectionOpen(navConfig, …)`，而 `openSections` 这个
       * state 只是「下次写配置的起点」——只改 state 不改配置，点击就不会有任何可见效果。
       * 与导航配置页走同一条路（`setOpenSections` + 写配置），两个入口才收敛到同一状态。
       *
       * 展开状态只在 `openSections` 里表达，没有第二个开关：所有分组同一套规则，
       * 收起哪个就只影响哪个。
       *
       * @param id - 要切换的分组 id。
       */
      /**
       * 切换一个分组的展开状态。
       *
       * 渲染读的是 `isSectionOpen(navConfig, …)`，所以必须写回配置才有效果；`openSections`
       * 这个 state 只是「下一次写配置的起点」。
       *
       * 写配置必须**重新读**再合并（同配置页的 `save`），不能用渲染时捕获的快照：快照里没有
       * 只存在于 storage 的键，展开一次分组就会把它们写丢，表现是本来隐藏的分组冒出来。
       *
       * 默认分组也进 `openSections`（出厂就在里面），所以它和其他分组一样从配置页切换，
       * 不需要额外标记。
       *
       * @param id - 要切换的分组 id。
       */
      const toggleSection = (id) => {
        const current = isSectionOpen(navConfig, id)
        // 从配置里取当前展开集合，再增删这一个 id：以 config 为准，不读渲染快照以外的副本。
        const listed = Array.isArray(navConfig.openSections) ? navConfig.openSections : DEFAULT_OPEN_SECTIONS
        const next = current ? listed.filter((x) => x !== id) : [...listed, id]
        writeNavConfig({ ...readNavConfig(), openSections: next })
      }

      // 应用配置后的分组表：顺序、名称、显隐都在这里生效。
      // 默认分组即便被隐藏也要留在列表里：它是无归属产品的落点，也是一些被隐藏分组
      // 回收产品的去处。隐藏它只该藏标题，不该让那些行跟着消失；
      // `resolveSections` 会把隐藏分组整体滤掉，所以这里单独把它捞回来。

      const listedSections = resolveSections(navConfig, t)
      const resolvedAll = resolveSections(navConfig, t, true)
      const anchor = resolvedAll.find((section) => section.id === 'g-default')
      const sections = anchor !== undefined && !listedSections.some((s) => s.id === 'g-default')
        ? [...listedSections, anchor].sort((left, right) => {
          // 落回它原本的位置：默认分组永远是第一组。
          return (left.id === 'g-default' ? -1 : right.id === 'g-default' ? 1 : 0)
        })
        : listedSections
      const hiddenProducts = resolveHiddenProducts(navConfig, products)

      // 隐藏分组 = 整组不渲染（标题与产品都不画）。
      //
      // 早先的做法是把隐藏分组的产品改挂到默认分组继续显示，后果有三个：
      // ① 「分组显示」开关看着没反应——行还在，只是换了标题；
      // ② 隐藏分组在配置页里没有标签可接，拖过去的行无处落地；
      // ③ 默认分组本就不画标题，藏它等于没有可见变化。
      // 现在产品留在原分组，整组一起消失，三个问题一起消失。
      const hiddenSectionIds = new Set(
        Array.isArray(navConfig.hiddenSections) ? navConfig.hiddenSections : [],
      )
      const visibleSections = sections.filter((section) => !hiddenSectionIds.has(section.id))
      // 隐藏分组的产品留在原分组，整组一起不渲染，所以这里没有"并入默认分组"这一步：
      // 没有行被迁移，也就没有迁移后的排序。
      const grouped = resolveGrouping(navConfig, visibleSections, products)
      // 分组一次建好索引：原来每个分组都扫一遍 grouped 再线性查一遍隐藏列表，
      // 复杂度是「分组数 × 行数」。这里先按归属归档并过滤掉隐藏行，
      // 每个分组直接取自己那一份，渲染结果完全一致。
      //
      // 必须放在 grouped 之后：它是 const，提前读取会落进暂时性死区，
      // 模块能加载、node --check 也过，只在轨道真正渲染时抛错。
      const hiddenProductSet = new Set(hiddenProducts.map((id) => String(id)))
      const rowsBySection = new Map()
      for (const entry of grouped) {
        if (hiddenProductSet.has(String(entry.id))) continue
        const bucket = rowsBySection.get(entry.section)
        if (bucket === undefined) rowsBySection.set(entry.section, [entry])
        else bucket.push(entry)
      }

      // 点「回到会话」时清掉本地选中项。
      //
      // 选中项记的是「用户点了哪一行」，而 `selectPanel(null)` 只把中间面板
      // 切回会话，不会改它。不清的话 `activeId` 会一直停在上次点的那一行：
      // 最典型是从左下角「插件管理」进来的——那次点击既写了选中项，又因为
      // `plugins` 不是已注册的 main key 而被吞掉异常，面板其实没切。之后一样
      // 点会话，界面上就表现为「大肥鱼 DSH 不激活」。
      //
      // 非产品入口（插件管理）同理：它切走的不是导航里的一行，不该占用选中态，
      // 否则同样会卡住 `activeId`。
      const selectRail = (id) => {
        // 只有「插件管理」不占选中态：它是页脚按钮，打开的是轨道之外的页面。
        //
        // 会话行（大肥鱼）必须记录。此前把它排除在外，于是点它时 pickedRail 被清成 null、
        // selectPanel(null) 又让 activePanel 保持 null，railId 一路兜到 null——
        // 产品行拿 null 去比 id 永不相等，选中底色因此永远不出现。
        const ownRow = id !== 'plugins'
        // 先提交选中态：这一步很轻，浏览器可以在下一次绘制就画出高亮。
        setPickedRail(ownRow ? id : null)
        // 换页是重活（对话界面要挂消息列表、Markdown、输入框）。放进 transition 后
        // 它不再阻塞点击反馈：高亮先亮，页面随后渲染。总耗时不变，观感差别很大。
        startTransition(() => {
          props.selectRail(id)
        })
      }

      const rail = h('nav', {
        className: 'pn-rail',
        // 布局内联：样式表若因热重载丢失，这一列仍然成立。
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: `0 0 ${railPx}px`,
          width: `${railPx}px`,
          boxSizing: 'border-box',
          /*
         * macOS hiddenInset：图标轨让出红绿灯（x 16–68, y 18–30）。
         *
         * 判据是 `narrowRail`（本壳自己的折叠轴），不是 `wide`（DSH 整列是否
         * 折叠）。点 logo 只翻 railCollapsed，wide 仍是 true——按 wide 判会让
         * 收起态继续走展开分支，图标照样压在灯下。
         *
         * 顶部条在这里帮不上忙：轨道 56px 装不下横跨 52px 的三个灯，所以
         * 收起态不画条，改由内边距让位。内联压过样式表，必须写在这一行上。
         */
        padding: narrowRail
          ? (darwinDesktop ? '52px 0 6px' : '8px 0 6px')
          : '8px 8px 6px',
          background: 'var(--dsw-specific-sidebar-fill)',
          overflow: 'hidden',
          ...(wide ? {} : { alignItems: 'center' }),
        },
        'aria-label': t('rail.label'),
        ...(narrowRail ? { 'data-collapsed': '' } : {}),
      },
      // macOS：顶部条让出红绿灯，同时自己就是窗口拖拽区。
      h('div', { className: 'pn-titlebar-strip', 'data-window-drag': '' }),
      // 品牌行：整列的收展开关交给 ui-layout 自己的按钮，这里只做展示。
      //
      // 三段式对齐右侧原生品牌：[OSCHINA 标志] [字标] [HARNESS 标签]。
      // 标签照原生做法做成实心反色块；字标降到 12px 以适应 180px 窄轨。
      //
      // 标志是绿色圆角方块 + 白色 C 形环，与参考图一致。C 的几何从给的图里量出来
      // （外半径 16.65、内半径 6.50、右侧 35° 缺口，逐点比对 95.3% 吻合），
      // 用两条圆弧画而不是描像素——原图是 JPEG，描边会带进压缩锯齿。
      h('button', {
        type: 'button',
        className: 'pn-rail-brand',
        // 折叠态下这是唯一常驻的可点区域，所以整行做开关，与参考原型一致。
        title: t(narrowRail ? 'rail.expand' : 'rail.collapse'),
        'aria-label': t(narrowRail ? 'rail.expand' : 'rail.collapse'),
        'aria-expanded': narrowRail ? 'false' : 'true',
        onClick: () => { toggleRailCollapsed() },
      },
        // 收起态才渲染，与原生 `!wide && renderSlot(...)` 同条件：展开态轨道里有完整文字，
        // 没有「折叠按钮上的角标」这回事。角标按契约非交互，整层不接指针，
        // 否则会吃掉品牌行本来要收到的点击。
        narrowRail
          ? h('span', { className: 'pn-rail-badge', 'aria-hidden': 'true' },
            renderSlot('sidebar.toggle.badge', {}))
          : null,
        h('span', { className: 'pn-rail-brand-mark', 'aria-hidden': 'true' },
          h('svg', { viewBox: '0 0 24 24', width: '20', height: '20' },
            h('rect', { x: '0', y: '0', width: '24', height: '24', rx: '5', fill: 'var(--pn-brand-green, #00a65e)' }),
            h('path', {
              fill: '#fff',
              d: 'M 20.39 9.35 A 8.8 8.8 0 1 0 20.39 14.65 L 15.28 13.03 A 3.44 3.44 0 1 1 15.28 10.97 Z',
            }))),
        h('span', { className: 'pn-rail-brand-name' }, t('brand.wordmark')),
        h('span', { className: 'pn-rail-brand-tag' }, t('brand.tag'))),
      h('div', {
        className: 'pn-rail-scroll',
        style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none' },
      },
        visibleSections.map((section, sectionIndex) => {
        // 首组紧贴品牌行，它的标题不需要为「上一组的产品行」留出 10px。
        const isFirst = sectionIndex === 0
          // 组内按注册顺序排。`grouped` 是 products 的映射结果，其顺序来自插件注册先后，
          // 与产品在该组里的位置无关；不排序时，凡是靠后注册却归入这个组的产品会排到前面。
          // 归属与隐藏已在 rowsBySection 里处理过，这里只排自己那一份，且过滤掉
          // 归属分组的行不会出现在别的组里，不必再逐组扫全表。
          const items = (rowsBySection.get(section.id) ?? [])
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
          // 空分组仍画标题：新增分组后整组消失会让人以为"没生效"。
          // Same reason as the config page: id, not `labelKey`.
          const isDefault = section.id === 'g-default'
          // 默认分组没有标题行可点，展开状态只能来自配置页的开关；出厂是展开。
          // 不能复用 `openSections`：那是「默认展开的分组」列表，出厂值是 ['g-ai']，
          // 从不包含默认分组——直接读它会让每次全新安装的默认分组都是收起的。
          const open = isSectionOpen(navConfig, section.id)
          return h('div', {
            key: section.id,
            className: 'pn-group',
            ...(open ? { 'data-open': '' } : {}),
            ...(isFirst ? { 'data-first': '' } : {}),
          },
          // 分组标题始终渲染（默认分组除外），空分组也保留标题。
          // 收起态不画标题：64px 放不下组名，且标题行会白白占掉纵向空间。
          // 默认分组不画标题，它的产品行直接跟在品牌行下面——这是这一组的分工，
          // 不是历史遗留：它收纳没有业务域归属的产品，加标题只是多占一行。
          // 它的显示/展开开关在导航配置页里，和其他分组同一处。
          // 被隐藏的分组（含默认分组）同样不画标题，这才是「显示 / 隐藏」的效果。
          isDefault || !wide || narrowRail || hiddenSectionIds.has(section.id)
            ? null
            : h('button', {
              type: 'button',
              className: 'pn-group-label',
              // 分组标题的视觉基线走内联，理由同 `.pn-item`。
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                height: '30px',
                // 首组上方是品牌行，两个上边距叠加会显得离 logo 远；首组收到 2px。
                margin: isFirst ? '2px 0 2px' : '10px 0 2px',
                padding: '0 8px',
                border: 'none',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--dsw-alias-label-tertiary)',
                fontSize: '12px',
                fontWeight: 500,
                textAlign: 'left',
              },
              onClick: () => { toggleSection(section.id) },
            },
            h('span', { className: 'pn-group-text' }, section.label),
            // 原型是 6px 实心三角，紧跟文字；展开朝下、收起朝右。
            h('span', { className: 'pn-group-arrow', 'aria-hidden': 'true' },
              h('svg', { viewBox: '0 0 24 24', width: '6', height: '6' },
                h('path', { d: 'M12 16 4 6h16z', fill: 'currentColor' })))),
          open
            ? items.map((entry) => entry.id === MORE_ROW_ID
              // 「更多」不是产品页：同一个行位，但点开的是弹层而不是换主内容。
              // 走同一处 map，宽度、字号、展开/收起行为才与相邻行一致。
              ? h(AnchoredMenu, {
                key: entry.id,
                label: t("more.label"),
                triggerClassName: 'pn-item pn-more-trigger',
                glyphClass: 'pn-item-glyph',
                labelClass: narrowRail ? null : 'pn-item-label',
              }, (close) => [
                h("button", {
                  key: "create",
                  type: "button",
                  role: "menuitem",
                  className: "pn-more-row",
                  onClick: () => { close(); createNavPlugin() },
                },
                h("span", { className: "pn-more-row-glyph", "aria-hidden": "true" }, h(IconPlus, { size: 16 })),
                h("span", { className: "pn-more-row-label" }, t("more.createProduct"))),
                h("button", {
                  key: "browse",
                  type: "button",
                  role: "menuitem",
                  className: "pn-more-row",
                  onClick: () => { close(); openPluginList() },
                },
                h("span", { className: "pn-more-row-glyph", "aria-hidden": "true" }, h(IconPinwheel, { size: 16 })),
                h("span", { className: "pn-more-row-label" }, t("more.browseProducts"))),
              ])
              : h('button', {
              key: entry.id,
              type: 'button',
              className: 'pn-item',
              // 行的视觉基线走内联，理由同 `.pn-nav`：产品插件一条越界选择器就能把
              // 产品行改成别的样子，内联样式让壳的基线不被外部规则夺走。
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                height: '32px',
                marginBottom: '2px',
                padding: '0 8px',
                border: 'none',
                borderRadius: '8px',
                background: 'transparent',
                // 不写 color：内联声明压过 .pn-item:hover，会造成「悬停不变色、只有点击后
                // 才变」——因为 [data-active] 带 !important 才赢得了内联。文字色交给样式表。
                fontSize: '13px',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              },
              title: wide && !narrowRail ? undefined : entry.label,
              'aria-label': entry.label,
              'aria-current': railId === entry.id ? 'page' : undefined,
              'data-active': railId === entry.id ? '' : undefined,
              onClick: () => { selectRail(entry.id) },
            },
            h('span', { className: 'pn-item-glyph', 'aria-hidden': 'true' },
              renderSlot(section.slot, { size: 18, active: railId === entry.id }, { only: entry.id })),
            narrowRail ? null : h('span', { className: 'pn-item-label' }, entry.label)))
            : null)
        })),
      h('div', { className: 'pn-rail-foot' },
        // 两个页脚按钮只放文字，不加图标：图标与其后的标签各自成盒，
        // 字身宽度不同就会让两行的文字起点错开。纯文字行天然左对齐。
        h('button', {
          type: 'button',
          className: 'pn-foot-button',
          title: t('rail.add'),
          'aria-label': t('rail.add'),
          onClick: () => { selectRail('plugins') },
        },
        h('span', { className: 'pn-foot-glyph', 'aria-hidden': 'true' },
          h(GLYPH_COMPONENTS.plugins, null)),
        narrowRail ? null : h('span', { className: 'pn-foot-label' }, t('rail.add'))),
        // 导航配置：与设置面板里的那一项是同一个页面，两个入口指向同一个 main key。
        h('button', {
          type: 'button',
          className: 'pn-foot-button',
          title: t('rail.configure'),
          'aria-label': t('rail.configure'),
          'data-active': railId === NAV_CONFIG_ID ? '' : undefined,
          onClick: () => { selectRail(NAV_CONFIG_ID) },
        },
        h('span', { className: 'pn-foot-glyph', 'aria-hidden': 'true' },
          h(GLYPH_COMPONENTS.configure, null)),
        narrowRail ? null : h('span', { className: 'pn-foot-label' }, t('rail.configure'))),
        // 页脚扩展位：登录等插件注册到这里，「插件管理」正下方。
        //
        // `wide` 必须是真实状态，不能恒 true：收起态下注册方需要据此切到紧凑形态，
        // 恒 true 会让它继续画整行文字，收起来后与其他图标行对不齐。
        h('div', { className: 'pn-rail-account' },
          renderSlot('sidebar.rail.account', { wide: !narrowRail }))))

      // 标题栏控制器挂在整列根部，不属于任何一个分支。
      //
      // 它们在收起态必须仍然存在，而收起态是 `if (!wide) return` 提前返回的另一棵树；
      // 挂进品牌行就等于要求「收起后还留在品牌行里」，物理上不成立。原生靠 position: fixed
      // 把这两个按钮钉在窗口标题栏上，与列内布局无关，所以这里也一样：节点放在根上，
      // 收起与展开两棵树都渲染同一份。
      //
      // 只在 html[data-windows-titlebar] 或 html[data-platform='darwin'] 时显示。
      // Web 端没有原生标题栏，fixed 会浮在页面上遮住内容，那种情况仍用品牌行里
      // 那个行内按钮。两条平台用同一对按钮，落点不同：Windows 在 (12, 40px 带内)，
      // macOS 在 (88, 12) —— 让开 x 16–68 的红绿灯，与原生 .leadingSeat 同构。
      const captionControls = h(React.Fragment, null,
        h('button', {
          type: 'button',
          className: 'pn-caption-toggle',
          title: collapsed ? t('rail.expandColumn') : t('rail.collapseColumn'),
          'aria-label': collapsed ? t('rail.expandColumn') : t('rail.collapseColumn'),
          'aria-expanded': collapsed ? 'false' : 'true',
          disabled: typeof props.toggleSidebar !== 'function',
          onClick: () => {
            if (typeof props.toggleSidebar === 'function') props.toggleSidebar()
          },
        }, h(IconPanelLeft, { size: 16 })),
        h('button', {
          type: 'button',
          className: 'pn-caption-new',
          title: t('nav.newSession'),
          'aria-label': t('nav.newSession'),
          onClick: () => { props.startSession() },
        }, h(IconNewChat, { size: 16 })))

      // 只有 ui-layout 真正把整列折叠时才走紧凑轨；产品导航自己的折叠不算，
      // 那种情况仍要渲染完整双列（左图标列 + 右导航列）。
      if (!wide) {
        // 折叠态：只留产品导航，外加原侧栏在这一列保留的紧凑控件。
        return h('div', {
          className: 'pn-shell',
          style: { display: 'flex', height: '100%', minHeight: 0, background: 'var(--dsw-specific-sidebar-fill)' },
        },
          captionControls,
          rail,
          h('div', { className: 'pn-nav pn-nav-rail' },
            h('button', {
              type: 'button',
              className: 'pn-collapsed-new',
              title: t('nav.newSession'),
              'aria-label': t('nav.newSession'),
              onClick: () => { props.startSession() },
            }, h('span', { 'aria-hidden': 'true' }, '+')),
            panels.map((panel) => h('button', {
              key: panel.id,
              type: 'button',
              className: 'pn-collapsed-panel',
              title: panel.label,
              'aria-label': panel.label,
              'aria-current': activePanel === panel.id ? 'page' : undefined,
              'data-active': activePanel === panel.id ? '' : undefined,
              onClick: () => { props.selectRail(panel.id) },
            }, renderSlot('sidebar.panellist', { size: 18, active: activePanel === panel.id }, { only: panel.id }))),
            h('div', { className: 'pn-rail-gap', 'aria-hidden': 'true' }),
            renderSlot('sidebar.settings', { wide: false })))
      }

      // 右列是否显示，由**插件自己的诉求**决定，不由壳去推断。
      //
      // 产品插件往 `sidebar.columns` 注册一行（id 与产品轨 id 相同）即表示
      // 「选中我时保留右列」；没有这行声明，选中它就整列不渲染，宽度让给主
      // 内容区。右列的内容仍来自它自己的 `sidebar.content`，两者独立：
      // 声明是产品决策，内容是产品实现。
      //
      // 为什么不是「查 sidebar.content 有没有注册」：那是壳替插件做推断。
      // 工作台、协作空间、添加产品不想要右列，但它们完全可能有别的
      // `sidebar.content` 用途；反过来，插件也可能想要一列而暂时没有内容。
      //
      // 产品没有声明 `sidebar.columns` 时右列整块隐藏，宽度真正还给主内容区。
      //
      // 整列宽度是 ui-layout 的 grid track（280/420），AppFrame 用内联
      // `gridTemplateColumns` 写死，ILayout 也没有宽度 setter。插件不拥有那个内联值，
      // 但可以在每次被重写之后**只替换第一条轨道**为产品轨宽度：中间与右侧轨道原样保留，
      // 第三条装着右面板，整条覆盖会把它关掉。改写时机见 `useSoloTrack` 的观察器。
      const wantsOwnColumn = !isDshPanelActive && !wantsColumn(activeId)

      if (wantsOwnColumn) {
        // key 必须与两列分支不同：两个分支的根都是 div，React 按 (type, key) 判定身份，
        // 同类型同 key 视为同一个元素，只会更新属性而不卸载/挂载，
        // 回调 ref 因此不会重新执行，widthFor 会沿用首次挂载时的判断结果。
        return h('div', {
          key: 'pn-shell-solo',
          className: 'pn-shell',
          'data-product-nav': '',
          'data-solo': '',
          ref: attachSolo,
        },
          captionControls, rail)
      }

      // DSH 面板激活时右列仍是 DSH 的工作区导航，所以按会话分支渲染。
      const showDshNav = isDshPanelActive || activeId === CONVERSATION_ID

      const rightColumn = showDshNav
        ? h(React.Fragment, null,
          // macOS：与产品轨同一 y 基准，两列内容都从 y=52 起画。没有这条，
          // 导航列第一行（品牌行）会被红绿灯压住。
          h('div', { className: 'pn-titlebar-strip', 'data-window-drag': '' }),
          // 品牌行。原生把它包成 button 用来新开会话（macOS 与无权限时退回纯展示），
          // 点击 [data-copy-version] 除外——本地构建的「点版本号复制」仍要走自己的处理。
          h('div', {
            className: 'pn-logo-row',
            // 收起时整行归零（原生 .root.collapsed .logoRow）；标题栏上的两个钮是 fixed，不受影响。
            'data-column-collapsed': collapsed ? '' : undefined,
          },
            h('button', {
              className: 'pn-brand',
              type: 'button',
              title: t('nav.newSession'),
              'aria-label': t('nav.newSession'),
              onClick: (event) => {
                if (event.target instanceof Element && event.target.closest('[data-pn-copy-version]') !== null) return
                props.startSession()
              },
            },
              // 原生把图标与字标一起包在 .brandIdentity 里，共享 24px 基线与 5px 间距。
              h('span', { className: 'pn-brand-identity' },
                h('span', { className: 'pn-brand-mark', 'aria-hidden': 'true' },
                  // 与原生同条件：没人注册就用鱼形标，否则品牌行会空一截。
                  renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: h(FishLogo, { size: 24 }) })),
                h('span', { className: 'pn-brand-name' },
                  renderSlot('sidebar.brand.name', {}, { fallback: t('brand.fallback') })))),
            // 折叠钮是 .brand 的兄弟节点，正是原生的排法（SidebarRoot.tsx:378）。
            h('button', {
              type: 'button',
              className: 'pn-caption-toggle',
              title: collapsed ? t('rail.expandColumn') : t('rail.collapseColumn'),
              'aria-label': collapsed ? t('rail.expandColumn') : t('rail.collapseColumn'),
              'aria-expanded': collapsed ? 'false' : 'true',
              disabled: typeof props.toggleSidebar !== 'function',
              onClick: () => {
                if (typeof props.toggleSidebar === 'function') props.toggleSidebar()
              },
            }, h(IconPanelLeft, { size: 16 }))),
          h('button', {
            type: 'button',
            className: 'pn-new',
            onClick: () => { props.startSession() },
          }, h('span', { 'aria-hidden': 'true' }, '+'), h('span', null, t('nav.newSession'))),
          // 可滚区：面板行与工作区在这里，品牌行与页脚留在外面。
          // ref 挂 `bindViewportRef`——滚轮交接器只有拿到视口才会真正绑监听，
          // 内在区段（会话列表）滚到底之后，多余的位移才转给导航。
          h('div', {
            className: 'pn-scroll',
            ref: scrollHandoff.bindViewportRef,
            // 原生 .scrollArea 是一个网格，第一列唯一用途是抵消负外边距，让内容列正好
            // 落在整列的 8px 上（居 lalu）。三列：4px 抵消 / 1fr 内容 / 6px 右侧留白；
            // 四行：8px 间隙 / 面板列表 / 2px 间隙 / 工作区——间隙作为真实行会随内容滚走。
            style: {
              // 原生 .scrollArea：网格首列 4px 只为被 margin-left: -4px 抵消，消完第 2 列正好
              // 落在整列 padding 的 8px 上；第 1、3 行是 8px/2px 的真实间隙行，会随内容一起滚走。
              // 三列之间：4px 抵消 / 1fr 内容 / 6px 右侧留白。
              display: 'grid',
              gridTemplateColumns: '4px minmax(0, 1fr) calc(var(--dsh-sidebar-inline-padding) - 2px)',
              gridTemplateRows: '8px max-content 2px max-content',
              alignContent: 'start',
              marginLeft: '-4px',
              marginRight: 'calc(2px - var(--dsh-sidebar-inline-padding))',
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          },
          panels.length > 0
            ? h('nav', { className: 'pn-panels', 'aria-label': t('nav.panels') },
              panels.map((panel) => h('button', {
                key: panel.id,
                type: 'button',
                className: 'pn-panel',
                'aria-current': activePanel === panel.id ? 'page' : undefined,
                'data-active': activePanel === panel.id ? '' : undefined,
                onClick: () => { props.selectRail(panel.id) },
              },
              h('span', { className: 'pn-panel-glyph', 'aria-hidden': 'true' },
                // 直接按 id 取：席位自己声明这个槽，`only` 能把行钉到它自己的图标上。
                renderSlot('sidebar.panellist', { size: 16, active: activePanel === panel.id }, { only: panel.id })),
              h('span', { className: 'pn-panel-label' }, panel.label))),
            // 原生在这里还有一个「更多」（SidebarRoot:428）：面板行之后、`</nav>` 之前。
            // 它是 ui-sidebar 里唯一硬编码画壳的元素（其余都走 slot），所以接管席位后按钮
            // 随 ui-sidebar 消失，而它读的 sidebar.panellist.actions 槽还在——这就是只丢了
            // 这一个的原因。
            h(AnchoredMenu, {
              label: t("more.label"),
              triggerClassName: 'pn-panel pn-more-trigger',
              glyphClass: 'pn-panel-glyph',
              labelClass: 'pn-panel-label',
            }, (close) => h("div", { style: { display: "contents" } },
              // 与原生同源：行来自席位，ui-entry-customization 往里注册未固定面板与两个插件动作。
              renderSlot("sidebar.panellist.actions", {
                entries: menuEntries,
                onOpen: (id) => { close(); props.selectRail(id) },
                onPinnedChange: (id, pinned) => { setPinnedRow(id, pinned) },
                onDismiss: close,
              }),
              // 未固定面板也列在这里：席位可能没装（没有 ui-entry-customization），那时
              // 未固定面板就无处可找。没有就不画——菜单空着是诚实的，加一行「没有…」
              // 只是噪声，原生也不这么做（它的 More 按钮本身就只在有内容时才出现）。
              menuEntries.map((entry) => h("button", {
                key: entry.id,
                type: "button",
                role: "menuitem",
                className: "pn-more-row",
                onClick: () => { close(); props.selectRail(entry.id) },
              }, h("span", { className: "pn-more-row-label" }, entry.label))),
            )),
            )
            : null,
          h('div', {
        className: 'pn-region',
        style: {
          // 这些变量原本由原生 .root 提供，接管席位后必须由壳给出；
          // 内联优先级高于任何样式表，热重载丢失样式时下游仍能拿到值。
          '--dsh-sidebar-inline-padding': '8px',
          '--dsh-sidebar-row-padding': '12px',
          '--dsh-sidebar-label-gap': '6px',
          '--dsh-sidebar-paint-inset': '3px',
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
          // 横向 0：基准由 .pn-nav 的 6px 8px 提供。原本的 0 8px 是整列还没有横向内边距
          // 时留下的补偿，现在会叠成 16px，让工作区比 logo 深一格。
          padding: '0',
          // 原生 .regionArea 同样显式占第 2 列第 4 行；不写就会被自动排进 4px 首列。
          gridColumn: '2',
          gridRow: '4',
          boxSizing: 'border-box',
        },
      },
            renderSlot('sidebar.workspaces', {
              wide: true,
              expandSidebar: () => { if (collapsed) props.toggleSidebar() },
            }, { hookContext: { useSectionScroller: scrollHandoff.useSectionScroller } }))),
          h('div', {
            className: 'pn-foot',
            // 页脚同样钉住布局与底色，理由同 `.pn-nav`。
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: '0 0 auto',
              gap: '2px',
              padding: '6px 8px 10px',
              boxSizing: 'border-box',
              maxWidth: '100%',
              background: 'transparent',
            },
          },
            renderSlot('sidebar.footer.action', { wide: true }),
            renderSlot('sidebar.settings', { wide: true })))
        // 产品自己注册了二级导航，本文件不代画。
        //
        // 外面这层 `pn-content-frame` 是给产品的**宽度参照**，不是装饰：
        //
        //   - `container-type: inline-size` 让产品可以写 `@container` 查询，按这一列的实际
        //     宽度降列，而不是按 window 宽度。后者在右栏展开、DPI 缩放、Electron 视口比
        //     物理宽度更宽时全部失效，表现为页面被裁切或右侧一片空白。
        //   - `--pn-content-width` 是同一事实的数值形态，给不写 CSS 容器查询的代码用。
        //
        // 壳无法阻止产品写 `html:has(.whatever) .pn-*` 去改壳的样式——那是选择器能力，
        // 不是接口。能做的是把正确的参照物递到手上，让「按容器自适应」成为顺手的选择。
        : h('div', {
          className: 'pn-content-frame',
          'data-product-content': activeId ?? '',
          style: { display: 'flex', flex: '1 1 auto', minWidth: 0, minHeight: 0, containerType: 'inline-size' },
        },
        renderSlot('sidebar.content', { wide: true, collapsed, activePanelId: activePanel },
          { entryKey: activeId }))

      return h('div', {
        // 与单列分支不同的 key，强制 React 把切换当成卸载 + 挂载，
        // 这样 ref 会重新执行、宽度按本条分支重新计算。
        key: 'pn-shell-panes',
        className: 'pn-shell',
        'data-product-nav': '',
        // 收起产品轨时这条分支也要把轨道钉窄。缺了它，有二级导航的产品收起后停在 420。
        ref: attachSolo,
        style: { display: 'flex', height: '100%', minHeight: 0, background: 'var(--dsw-specific-sidebar-fill)' },
      },
        // 标题栏控制器必须在这条分支里也渲染一份：这是「有二级导航的产品」走的路径，
        // 也就是大肥鱼 DSH 那条。fixed 元素不要求在它所影响的列内，但必须由某条分支渲染，
        // 三条出口（solo / panes / collapsed）各带一份才不会出现「某个产品下按钮消失」。
        captionControls,
        rail,
        h('div', {
          className: 'pn-nav',
          // 颜色与字号也走内联：产品插件常用 `html:has(.my-page) .pn-*` 这类越界选择器，
          // 一条规则就能把整列的底色和文字色改掉。内联样式优先级高于任何选择器，外部
          // 只能靠 `!important` 才盖得住，所以把「这一列必须长什么样」钉在这里。
          // 布局项同理：样式表热重载丢失时，这一列仍然成立。
          style: {
            display: 'flex',
            flexDirection: 'column',
            /*
             * 跟随宿主列宽（B）：导航列吃掉产品轨之外的全部剩余，不按 240 起算。
             *
             * `flexBasis: navPx` 会让这一列从 240 起算再被压缩，而它的子元素仍按
             * 240 的内容宽排版，于是内容比容器宽、右侧被主内容区切掉。改成
             * basis 0 + grow 1 后，这一列的宽度就是容器真实剩余量，子元素跟着收。
             */
            flex: '1 1 0',
            flexBasis: '0%',
            minWidth: 0,
            minHeight: 0,
            // 原生 .root 用 padding: 6px var(--dsh-sidebar-inline-padding)，左右各 8px，
            // 由**整列**提供；行自己不再加横向 margin。之前这里是 '6px 0'（横向 0），
            // 每个子元素各自补 8px，导致品牌行落在 8、面板行落在 16——两列左边距对不齐。
            padding: '6px 8px',
            boxSizing: 'border-box',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: '14px',
            '--dsh-sidebar-inline-padding': '8px',
            '--dsh-sidebar-row-padding': '12px',
            '--dsh-sidebar-label-gap': '6px',
            '--dsh-sidebar-paint-inset': '3px',
          },
        }, rightColumn))
    }

    /**
     * Shrink the sidebar grid track while a solo rail is mounted.
     *
     * ui-layout's AppFrame writes `gridTemplateColumns` as an inline style and exposes no width
     * setter, so a slot occupant cannot ask it for a narrower column. The inline declaration is
     * still only an inline declaration: it can be replaced, and that is all this does.
     *
     * **It has to be replaced repeatedly.** The frame re-renders on every layout change and
     * rewrites all three tracks each time, including when the right panel opens. A callback ref
     * runs only at mount, so a single write is undone by the next layout pass: the track returns to
     * its preferred width while the rail inside keeps the rail width, leaving an empty band. A
     * MutationObserver on the frame's `style` re-applies the pin after each rewrite.
     *
     * **Why the baseline lives in a DOM attribute.** Disabling a plugin removes its slot
     * registrations; it does not unmount the React root (`root.unmount` only runs when the whole
     * renderer tears down). So when this plugin is disabled, neither the callback ref nor an effect
     * cleanup is guaranteed to run — React simply stops rendering the component. Keeping the
     * baseline on the grid element makes it survive any number of enable/disable cycles, because
     * the element outlives the plugin.
     *
     * The grid container is not identified by class name (CSS Modules hashes them). It is the
     * nearest ancestor that actually carries the property, so the lookup holds however many
     * wrappers ui-layout adds.
     *
     * @returns a callback ref to attach to the solo shell.
     */
    const SOLO_TRACK_ATTR = 'data-pn-track-baseline'

    /**
     * Split a `grid-template-columns` declaration into its top-level tracks.
     *
     * Parentheses are respected, so `minmax(0px, 1fr)` stays a single track.
     * @param value - the declaration to split.
     * @returns the tracks in source order.
     */
    function splitTracks(value) {
      const tracks = []
      let depth = 0
      let start = 0
      for (let index = 0; index < value.length; index += 1) {
        const char = value[index]
        if (char === '(') depth += 1
        else if (char === ')') depth -= 1
        else if (depth === 0 && (char === ' ' || char === '\t' || char === '\n')) {
          if (index > start) tracks.push(value.slice(start, index))
          start = index + 1
        }
      }
      if (start < value.length) tracks.push(value.slice(start))
      return tracks
    }

    /**
     * Replace only the sidebar track, keeping the centre and right tracks as ui-layout wrote them.
     *
     * The right panel occupies the third track; rewriting the whole declaration would close it,
     * which is why this does not assign a fixed three-track template.
     * @param value - the current `grid-template-columns` declaration.
     * @param railWidth - width the first track must have. It depends on the rail's own collapsed
     *   state: pinning the expanded width while the rail is an icon column would leave the empty
     *   band again.
     * @returns the pinned declaration, or null when there is nothing to pin.
     */
    function pinFirstTrack(value, railWidth) {
      const tracks = splitTracks(value.trim())
      if (tracks.length === 0) return null
      return [`${railWidth}px`, ...tracks.slice(1)].join(' ')
    }

    function useSoloTrack(railWidth, navWidth, hostWidth) {
      const restoreRef = useRef(null)

      // 这一帧该钉多宽。`data-solo` 由渲染时写在根节点上，回调 ref 执行时属性已经落地。
      //
      // 关键约束：钉宽不得超过宿主动给这一列的实际宽度。原来的写法恒写
      // `railWidth + navWidth`（展开 420），宿主只给 369 时轨道与容器不符，
      // 内容按 420 排、容器 369，右侧被主内容区切掉 51px——看起来就是
      // 「行被挤压 + 右边框消失」。
      // 钉多宽只由本壳的设计宽度决定，**不与 hostWidth 比较**。
      //
      // 原来的 Math.min(wants, hostWidth) 想防「宿主真的更窄」，但 hostWidth 恰恰是本壳上次钉下
      // 的值的回报：收起 → 钉 296 → 宿主回报 296 → 展开时 Math.min(420, 296) 又钉回折叠宽度。
      // 放宽成「低于收起态阈值才夹」只是换了震荡点，初始帧的 280 照样被当上限。
      //
      // 窄视口不靠这里兜底：小于 SIDEBAR_AUTO_COLLAPSE 时 ui-layout 直接报 collapsed，
      // 小于抽屉断点时整列浮在内容上（pin() 对 drawer 提前返回）。
      const widthFor = (node) => (node.hasAttribute('data-solo') ? railWidth : railWidth + navWidth)

      const attach = useCallback((node) => {
        // React calls this with null on unmount: put the track back first.
        if (restoreRef.current !== null) {
          restoreRef.current()
          restoreRef.current = null
        }
        if (node === null) return

        let grid = null
        let cursor = node.parentElement
        while (cursor !== null && cursor !== document.body) {
          if (cursor.style.gridTemplateColumns !== '' || cursor.hasAttribute(SOLO_TRACK_ATTR)) {
            grid = cursor
            break
          }
          cursor = cursor.parentElement
        }
        if (grid === null) return

        // The baseline is whatever the column had before this plugin ever wrote to it. An
        // attribute set earlier is authoritative; the element's own current value is only a
        // baseline if it is not already our own pinned track.
        const width = widthFor(node)
        const recorded = grid.getAttribute(SOLO_TRACK_ATTR)
        // 记录**当前的真实声明**，不设「不知道」哨兵。
        //
        // 曾经的 looksPinned 分支在「第一条轨道已经等于目标宽度」时把 baseline 记成空串，
        // 那恰好是常态：展开态两列的宽度 420 与 ui-layout 自己写的值相同。于是首帧就记下空串，
        // 空值守卫从此拒绝钉宽度，收起产品轨时列宽停在 420。
        //
        // 三轨声明无论是谁写的都是有效值，还原它交给 ui-layout 都是安全的；
        // 真正不能做的是还原「空」——那会抹掉宿主的 grid 定义。所以守卫只认空串。
        const baseline = recorded !== null ? recorded : grid.style.gridTemplateColumns
        if (recorded === null) grid.setAttribute(SOLO_TRACK_ATTR, baseline)

        // pin 与 restore 是两件事，不能用一个提前返回绑在一起。
        //
        // 曾经的 `if (baseline === '') return` 阻止了「还原空声明」这个真实故障，
        // 但也顺手把 pin 一起跳过了：只要挂载那一刻 frame 的内联声明是空的，
        // 这个分支就永远不钉宽度，没有二级导航的产品会停在宿主给的 420。
        //
        // restore 需要一个总是合法的值。没有记录时就用宿主宽度重建第一轨，
        // 三轨声明因此不会变成空串；连重建都不可能时（拿不到当前声明），
        // 宁可保留自己钉过的值——陈旧宽度可以恢复，被抹掉的声明不能。

        // One write per distinct observed value bounds the observer: writing the same declaration
        // twice would otherwise retrigger it. `last` is read back after assignment so browser
        // normalisation cannot make the stored value differ from the live one.
        // restore 写回什么：优先用记录下来的宿主声明，
        // 没有就用宿主宽度重建第一轨，两者都拿不到时返回 null（不还原）。
        const restoreDeclaration = (() => {
          if (baseline !== '') return baseline
          const rebuilt = pinFirstTrack(grid.style.gridTemplateColumns, hostWidth)
          return rebuilt
        })()

        let last = null
        const pin = () => {
          // Drawer mode overlays the column on the content; ui-layout owns that geometry.
          if (grid.hasAttribute('data-sidebar-drawer')) return
          const current = grid.style.gridTemplateColumns
          if (current === last) return
          const pinned = pinFirstTrack(current, width)
          if (pinned === null || pinned === current) {
            last = current
            return
          }
          grid.style.gridTemplateColumns = pinned
          last = grid.style.gridTemplateColumns
        }

        pin()
        grid.setAttribute('data-animating', '')
        const observer = new MutationObserver(pin)
        observer.observe(grid, { attributes: true, attributeFilter: ['style'] })

        restoreRef.current = () => {
          observer.disconnect()
          // 只写能保证非空的值：重建出来的宿主宽度，或记录下来的声明。
          // 两者都没有时保留当前值，绝不写空串——那会抹掉 frame 的 grid 定义，
          // 而 React 的 diff 认为它已经设过该属性，不会补写。
          if (restoreDeclaration !== null) grid.style.gridTemplateColumns = restoreDeclaration
          grid.removeAttribute('data-animating')
        }
        // A width change re-creates the ref, so React detaches (restoring the baseline) and
        // reattaches, which pins track 1 at the new width.
        //
        // hostWidth 必须在依赖里。它来自 ui-layout 报告的当前列宽，会跟着我们钉下的值变化：
        // 收起产品轨 → 钉 296 → 宿主回报 296 → hostWidth = 296。展开时 railWidth 回到 180，
        // 但若这次重建发生在宿主回报新值之前，Math.min(420, 296) 就把轨道钉回 296，
        // 导航列只剩 296 - 180 = 116px——折叠再展开后第二列被压窄。
        // 把 hostWidth 放进依赖，宿主宽度一变就重建并按真实值重新夹取。
      }, [railWidth, navWidth])

      return attach
    }

    /** 故障隔离：渲染崩溃时报告堆栈，而不是留一列空白。 */
    class ProductBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) { return { error } }

      render() {
        if (this.state.error === null) return this.props.children
        return h('div', { className: 'pn-error' },
          `dsh-osc-harness-sidebar failed:\n${String(this.state.error?.stack ?? this.state.error)}`)
      }
    }

    return {
      /*
     * uiWorkspace 必须在这里声明。
     *
     * 「新会话」「写插件」「打开会话」都走 ctx.get('uiWorkspace').startSession()，
     * 但 ctx.get 不会等兄弟插件把服务挂上——apply 先跑完时它返回 undefined，
     * 调用静默失败，表现就是点了按钮毫无反应。
     *
     * 声明进 inject 后 Cordis 会等该服务就绪再执行 apply。原生 ui-sidebar 也是
     * 这么做的：inject: ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts']。
     */
    inject: ['slots', 'layout', 'locale', 'uiWorkspace'],

      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'product-nav: dictionaries')
        // 每次调用都重新 bind，而不是把 apply 时的绑定结果一直传下去。
        //
        // 字典由上面的 `ctx.effect` 注册，插件禁用时随之移除；此时 locale 服务按契约让
        // 查表退回 key（`locale.client.spec.ts` 就是这么断言的）。若组件持有 apply 那一刻
        // 的绑定，关闭再开启后它仍在查一份不存在的字典，于是所有文案变成 `brand.wordmark`
        // 这类 key 原文，只能整页刷新才恢复。
        //
        // `bind` 在服务内部按命名空间缓存，重复调用只是一次查表；重新开启后立刻拿到恢复的
        // 字典，组件不必重建。
        // 取服务对象只做一次：读 `ctx.<service>` 是上下文操作，插件停用后该上下文变成
        // inactive，访问即抛 `cannot get required service "locale" in inactive context`。
        // 而调用已取到对象上的方法不是上下文操作，所以这里抓对象、每次只调 `bind`。
        //
        // `bind` 在服务内部按命名空间缓存，重复调用只是一次查表；重新启用后立刻拿到恢复的
        // 字典。若只在 apply 时绑一次并把结果传下去，停用期间字典被移除，组件持有的旧绑定
        // 会一直查不到，文案退化成 key 原文。
        // 读 `ctx.<service>` 是上下文操作：插件停用后该上下文变成 inactive，访问即抛
        // `cannot get required service … in inactive context`；而调用已取到对象上的方法不是。
        //
        // 组件在插件停用期间仍挂在页面上，它持有的快照与回调会继续被调用，所以这些服务
        // 必须在这里抓一次，闭包里只引用本地绑定。`ctx.get` 也只在这里调：调用时机决定
        // 它是上下文操作还是一次普通查表。
        const locale = ctx.locale
        const slots = ctx.slots
        const layout = ctx.layout
        const t = (key, params) => locale.bind(NS)(key, params)

        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-product-nav', '')
          style.textContent = STYLES
          document.head.append(style)
          return () => { style.remove() }
        }, 'product-nav: stylesheet')

        // 投影：useSyncExternalStore 按引用比较快照，所以每个投影都缓存，
        // 只在对应席位通报变化时失效；每次读都重新 map 会让 React 无限重渲染。
        let cachedRail
        // 产品全部注册进 `sidebar.products` 一个槽，分组由配置决定，不由槽位决定。
        // 所以这里只读那一个槽，组别留给渲染层按 `productGroups` 归组。
        const projectRail = () => slots.entriesOfSlot(PRODUCT_SLOT).map((entry) => {
          const id = String(entry.options.id ?? entry.options.key ?? '')
          return {
            id,
            order: entry.options.order ?? 0,
            label: labelOf(entry.options.label, id),
          }
        })
        const invalidateRail = () => { cachedRail = undefined }
        const products = {
          getSnapshot: () => { cachedRail ??= projectRail(); return cachedRail },
          subscribe: (listener) => {
            // 旧的分组槽位也订阅：迁移期若有包仍注册进 `g-*`，列表要跟着刷新。
            const offs = [PRODUCT_SLOT, ...SECTIONS.map((section) => section.slot)]
              .filter((slot, index, all) => all.indexOf(slot) === index)
              .map((slot) => slots.subscribe(slot, () => { invalidateRail(); listener() }))
            return () => { invalidateRail(); for (const off of offs) off() }
          },
        }

        let cachedPanels
        const projectPanels = () => slots.entriesOfSlot('sidebar.panellist').map((entry) => ({
          id: String(entry.options.id),
          order: entry.options.order ?? 0,
          label: labelOf(entry.options.label, String(entry.options.id)),
        }))
        const invalidatePanels = () => { cachedPanels = undefined }

        // 面板固定集合归 ui-layout 管（原生侧栏由此决定哪些行留在列表、哪些收进「更多」）。
        // 本壳不画面板列表，但「更多」菜单要按同一集合区分——只读它，不另存一份。
        const panelPins = ctx.get('uiLayoutPins')
        const isPinned = (id) => {
          const read = panelPins?.pinned
          if (typeof read !== 'function') return true
          try {
            const set = read()
            return Array.isArray(set) ? set.includes(id) : true
          } catch {
            // 宿主状态未就绪：当作已固定，行留在列表里总比整块消失安全。
            return true
          }
        }

        // `onPinnedChange` 的回写。宿主没提供能力时静默跳过：这是在点击回调里，
        // 抛错会连带打断整条点击链路。
        const setPinnedRow = (id, pinned) => {
          const write = panelPins?.setPinned
          if (typeof write !== 'function') return
          try {
            write(id, pinned)
          } catch {
            // 同上：宿主拒绝写入不影响菜单渲染。
          }
        }
        const panels = {
          getSnapshot: () => { cachedPanels ??= projectPanels(); return cachedPanels },
          subscribe: (listener) => {
            const off = slots.subscribe('sidebar.panellist', () => { invalidatePanels(); listener() })
            return () => { invalidatePanels(); off() }
          },
        }

        let cachedContentKeys
        const projectContentKeys = () => slots.entriesOfSlot('sidebar.content')
          .map((entry) => String(entry.options.key))
        const invalidateContentKeys = () => { cachedContentKeys = undefined }
        const contentKeys = {
          getSnapshot: () => { cachedContentKeys ??= projectContentKeys(); return cachedContentKeys },
          subscribe: (listener) => {
            const off = slots.subscribe('sidebar.content', () => { invalidateContentKeys(); listener() })
            return () => { invalidateContentKeys(); off() }
          },
        }

        // 右列诉求：产品插件往 `sidebar.columns` 注册一行，id 与产品轨 id 相同，
        // 表示「我准备了一列」——注册本身不再等于占位。详见 projectColumnIds。
        //
        // 某个 id 的列要不要真的占地方，由三条判据决定（见下面的实现）。
        //
        // `sidebar.columns.collapsed` 是同一件事的第二种意图：「已声明，但现在收起」。
        // 两者的 id 相同时收起优先，所以产品可以在运行时把这一列拿掉再放回来，而不必
        // 反复注册/注销 `sidebar.columns`。
        let cachedColumnIds
        const projectColumnIds = () => {
          const collapsed = new Set(
            slots.entriesOfSlot('sidebar.columns.collapsed')
              .map((entry) => String(entry.options.id)),
          )
          const visible = new Set(
            slots.entriesOfSlot('sidebar.columns.visible')
              .map((entry) => String(entry.options.id)),
          )
          const declared = slots.entriesOfSlot('sidebar.columns')
            .map((entry) => String(entry.options.id))
          // 此刻确实注册了列的 id 记入 legacy，让升级前工作的包继续工作。
          rememberLegacyColumnIds(declared)
          return declared.filter((id) =>
            !collapsed.has(id) && (visible.has(id) || legacyColumnIds.has(id)))
        }
        const invalidateColumnIds = () => { cachedColumnIds = undefined }
        const columnIds = {
          getSnapshot: () => { cachedColumnIds ??= projectColumnIds(); return cachedColumnIds },
          subscribe: (listener) => {
            const off = slots.subscribe('sidebar.columns', () => { invalidateColumnIds(); listener() })
            const offVisible = slots.subscribe('sidebar.columns.visible', () => {
              invalidateColumnIds()
              listener()
            })
            const offCollapsed = slots.subscribe('sidebar.columns.collapsed', () => {
              invalidateColumnIds()
              listener()
            })
            return () => { invalidateColumnIds(); offCollapsed(); offVisible(); off() }
          },
        }

        // 可选服务同样只在这里取一次：`ctx.get` 是上下文操作，插件停用后再调会抛。
        const workspaceUi = ctx.get('uiWorkspace')
        const pluginNavigation = ctx.get('pluginNavigation')

        // 新会话走 Workspace UI 的共享动作，原侧栏的新会话按钮用的也是它。
        const startSession = () => {
          if (typeof workspaceUi?.startSession === 'function') workspaceUi.startSession()
        }

        // 「更多」菜单的两个动作。原生侧栏由 ui-entry-customization 提供，它注册进
        // 本壳拥有的席位，是兄弟插件而非依赖，所以这里照它的做法实现，而不是去调用它。
        const openPluginList = () => {
          if (typeof pluginNavigation?.openList === 'function') pluginNavigation.openList()
        }

        const createPlugin = () => {
          if (typeof workspaceUi?.startSession !== 'function') return
          // 与原生 More 菜单一致：开一个 cordis 预设会话，把「写一个插件」当成任务发下去。
          workspaceUi.startSession(undefined, { agentPreset: 'cordis', whenDraftExists: 'append' })
        }

        /**
         * 产品轨「更多」里的「创建你的插件」。
         *
         * 与 `createPlugin` 的差别只在引导语：那个是原生通用入口，编辑器空着让用户自己写；
         * 这个的题目固定是「往这条产品导航加一个插件」，所以先把话说清楚，会话从产品导航
         * 的语境起步。`whenDraftExists: "append"` 沿用原生选择，不覆盖用户写了一半的内容。
         */
        const createNavPlugin = () => {
          if (typeof workspaceUi?.startSession !== "function") return
          workspaceUi.startSession(undefined, {
            agentPreset: "cordis",
            whenDraftExists: "append",
            prompt: t("more.createProductPrompt"),
          })
        }

        const injectProps = () => ({
          startSession,
          openPluginList,
          setPinnedRow,
          // 未固定面板就是「更多」菜单默认要列的行，与原生 `hasEntryActions` 的口径一致。
          menuEntries: panels.getSnapshot()
            .map((panel) => ({ id: panel.id, label: panel.label, pinned: isPinned(panel.id) }))
            .filter((panel) => !panel.pinned),
          createPlugin,
          createNavPlugin,
          toggleSidebar: () => { layout.toggleSidebar() },
          // `selectPanel` 会在目标 key 未注册时抛错，并**保留原来的选择**。
          // 产品包的 main 注册不保证成功（main 是 keyed 槽，key 集合由已注册的
          // 条目决定，包也可能加载失败），所以这里必须吞掉异常：否则点工作台后
          // `activePanelId` 仍是 null，界面看起来毫无反应。选中态由组件自己的
          // 本地状态兜住。
          selectRail: (id) => {
            try {
              if (id === CONVERSATION_ID) { layout.selectPanel(null); return }
              layout.selectPanel(id)
            } catch {
              // 未注册的 main key：保持侧栏可交互，不让整个点击链路炸掉。
            }
          },
          hooks: { products, panels, contentKeys, columnIds },
          // 配置页要读同一份产品投影：`hooks.products` 是给渲染用的原始句柄，
          // 页面侧需要一个 hook 形态才能在 React 里订阅变化。
          useProducts: (selector) => useSyncExternalStore(
            products.subscribe,
            () => selector(products.getSnapshot()),
          ),
          // 导航配置：配置页写、轨道读。两处入口共用这一份订阅。
          useNavConfig: (selector) => useSyncExternalStore(
            subscribeNavConfig,
            () => selector(getNavConfigSnapshot()),
          ),
          // 配置页需要字典来显示内置分组名。
          t,
        })

        // 把左列拉到 ui-layout 的上限（SIDEBAR_MAX = 420）。两列布局在默认 280
        // 下只能给出 148 / 132，跟「左 180 右 240」的目标差得远，所以启动时顶格。
        //
        // `ILayout` 的公共面没有设置宽度的方法，`toggleSidebar` 只能在 0 和默认
        // 值之间切。真正的写入动作是 ui-layout 内部 store 的 `setSidebar`，我们
        // 只能按能力探测去够它：TS 的 `private` 在运行时仍是普通属性，但若构建
        // 产物用了 `#private`，`panels` 就读不到。所以下面按「常见持有位置」逐层
        // 探测，全都够不到就安静退回默认布局——宽度会窄，但不影响功能。
        ctx.effect(() => {
          const candidates = [ctx.layout, ctx.layout?.panels, ctx.layout?.store, ctx.layout?.layoutInfo]
          for (const holder of candidates) {
            for (const key of ['setSidebar', 'actions']) {
              const fn = holder?.[key]
              const setSidebar = typeof fn === 'function' ? fn : fn?.setSidebar
              if (typeof setSidebar !== 'function') continue
              try {
                setSidebar.call(typeof fn === 'function' ? holder : fn, SIDEBAR_MAX_WIDTH)
                return
              } catch {
                // 这个持有者不接受该调用，继续找下一个。
              }
            }
          }
        }, 'product-nav: widen the column')

        // 接管左列。priority -1000 压过 ui-sidebar，本 bundle 的补丁同时禁用
        // 了那一行：原占据者声明的子席位和这里重复，二次声明会抛 already declared。
        //
        // 所有针对子席位的注册都在这个回调内部：`sidebar.products` 与
        // `sidebar.content` 只有在上面这次 register 声明之后才存在，写在 apply
        // 顶层会在热启用时抛错并中断 apply，表现为左列空白、重启才好。
        ctx.slots.inject('sidebar', () => {
          // 不用 `registerFactory`：它的 occurrence 由 `FactoryErrorBoundary` 兜底，而该边界
          // 只渲染空占位；插件停用后 factory 定义先被拆除，保留中的组件树却仍会渲染一次，
          // 于是 `StaleAuthorizationError` 以「半翻译的列」形态冒出来，而不是干净卸载。
          // 席位自己声明 `sidebar.panellist` 与 HEAD 一致，热开关行为也回到那时。
          const disposeRegistration = ctx.slots.register({
            name: 'sidebar',
            priority: -1000,
            locale: NS,
            children: {
              // 产品行的唯一收集槽。所有产品包与内置行都注册到这里，组别由配置决定。
              'sidebar.products': { kind: 'list', scope: 'root' },
              // 五个旧分组槽：保留声明只为让仍在往这里注册的包不报错（声明缺失会
              // 抛「slot is not declared」并中断 apply）。壳不渲染它们，内部订阅
              // 也只是为了触发重算。
              'sidebar.products.g-ai': { kind: 'list', scope: 'root' },
              'sidebar.products.g-pm': { kind: 'list', scope: 'root' },
              'sidebar.products.g-code': { kind: 'list', scope: 'root' },
              'sidebar.products.g-cicd': { kind: 'list', scope: 'root' },
              'sidebar.products.g-sec': { kind: 'list', scope: 'root' },
              'sidebar.products.g-platform': { kind: 'list', scope: 'root' },
              // 当前产品的二级导航。插件**可选**注册；没注册就没有右列。
              'sidebar.content': { kind: 'keyed', scope: 'root' },
              // 右列诉求声明：注册一行即表示「我选中时要保留右列」。
              //
              // 单独一个席位是因为 `slots.register` 只保留 key/id/order/label/
              // priority，注册选项上的自定义字段会被丢弃，没法把 `wantsColumn`
              // 挂在产品轨那一行上。声明与内容分开也正好符合语义：声明是产品
              // 决策，内容是产品实现，两者互不必然。
              'sidebar.columns': { kind: 'list', scope: 'root' },
              // 右列收起声明：往这里注册一个 id，表示「该产品的右列默认收起」。
              //
              // 存在的理由是 `sidebar.columns` 只能表达「我要不要一列」，不能表达「我要，
              // 但现在先别占地方」。产品在 columns 里注册了导航组件、内容却动态为空时
              // （例如未选中任何二级项），壳看到的仍是「已声明」，于是留一条空白列。
              // 声明拆到独立席位后两个意图不再互相绑架：注册 columns 是「我有右列改
              // 造能力」，注册这里是「这次先别显示它」。
              'sidebar.columns.collapsed': { kind: 'list', scope: 'root' },
              // 右列占位声明：往这里注册一个 id 才真的占地方。与 `sidebar.columns` 分开，是为了
              // 让插件能按自己的状态收放这一列（例如未选中任何二级项时先不占空间），而注册项
              // 本身只保留 key/id/order/label/priority，放不下「现在有没有内容」这类字段。
              'sidebar.columns.visible': { kind: 'list', scope: 'root' },
              // 页脚扩展位，在「插件管理」正下方。账号/登录状态注册到这里。
              'sidebar.rail.account': { kind: 'list', scope: 'root' },
              // 面板图标收集槽。头版就是这样由席位自己声明的；工厂那条路见上面的说明。
              'sidebar.panellist': { kind: 'list', scope: 'root' },
              'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
              // inject 面与渲染时的 hookContext 是一对；缺一会把 undefined 交给取用方。
              'sidebar.workspaces': { kind: 'single', scope: 'root', inject: SIDEBAR_SECTION_INJECT },
              'sidebar.settings': { kind: 'single', scope: 'root' },
              'sidebar.footer.action': { kind: 'list', scope: 'root' },
              'sidebar.brand.mark': { kind: 'single', scope: 'root' },
              'sidebar.brand.name': { kind: 'single', scope: 'root' },
              'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
            },
            inject: injectProps,
          }, function FramedSidebar(props) {
            // 挂载时记下代次；disposer 递增后这里变 false，整列直接出画。
            // 用 useSyncExternalStore 而不是普通 state：过期的树需要一次主动重渲染，
            // 而这正好也拦住了框架那次会抛 `StaleAuthorizationError` 的渲染。
            const generation = React.useSyncExternalStore(
              (onChange) => {
                seatGenerationListeners.add(onChange)
                return () => { seatGenerationListeners.delete(onChange) }
              },
              () => seatGeneration,
            )
            const mountedAt = React.useRef(generation)
            if (mountedAt.current !== generation) return null
            return h(ProductBoundary, null, h(ProductSidebar, props))
          })

          // 内置行：与产品包一样只往单一汇总槽注册，分组由配置决定，
          // 所以这里不再按 seed.section 挑槽位——否则它会落在没人渲染的旧分组槽里。
          /*
          * 窗口顶带控件（shell.leading）。
          *
          * 整列隐藏时框架把 grid 第一轨压成 0px，而 .sidebarCol 是 overflow: hidden，
          * 列内任何东西都会被裁掉——列内那套 captionControls 到那时就看不见了。
          * 框架因此自带一个列外的控件座，只在 darwin + 整列隐藏时挂载
          * （AppFrame.tsx:286 的 leadingMounted，定位在 (88, 11)，见 AppFrame.module.css
          * 的 .leadingSeat）。原生由 ui-sidebar 的 HeaderLeadingControls 填它；
          * 本壳禁用了 ui-sidebar，所以一直是空的。
          *
          * 这里填上：展开侧栏 + 新会话。座只在这种状态出现，因此不会与列内的
          * captionControls 重复。
          */
         const disposeLeading = ctx.slots.inject('shell.leading', () => ctx.slots.register({
           name: 'shell.leading',
           id: 'dsh-osc-harness-sidebar.leading',
           order: 10,
         }, function LeadingControls() {
           return h('div', { className: 'pn-leading' },
             h('button', {
               type: 'button',
               className: 'pn-leading-btn',
               title: t('rail.expandColumn'),
               'aria-label': t('rail.expandColumn'),
               onClick: () => {
                 if (typeof props.toggleSidebar === 'function') props.toggleSidebar()
               },
             }, h(IconPanelLeft, { size: 16 })),
             h('button', {
               type: 'button',
               className: 'pn-leading-btn',
               title: t('nav.newSession'),
               'aria-label': t('nav.newSession'),
               onClick: () => { props.startSession() },
             }, h(IconNewChat, { size: 16 })))
         }))

         const disposeSeeds = SEEDS.map((seed) => ctx.slots.register({
            name: PRODUCT_SLOT,
            id: seed.id,
            order: seed.order,
            label: () => t(seed.labelKey),
          }, seed.glyph))

          // 右列诉求：只有 `column: true` 的产品声明自己要右列。工作台、协作
          // 空间、添加产品不在其中，选中它们就没有右列。
          const disposeColumns = SEEDS
            .filter((seed) => seed.column === true)
            .map((seed) => ctx.slots.register({
              name: 'sidebar.columns',
              id: seed.id,
            }, function NoColumnContent() { return null }))
          invalidateRail()
          invalidateColumnIds()

          // `sidebar.content` 不加默认注册：DSH 的导航由占据者本体就地绘制，
          // 这个 keyed 席位专门留给其他产品注入自己的导航。
          invalidateContentKeys()

          return () => {
            // 先让已挂载的树停止出画，再拆注册：顺序反过来的话，树会在拆完之后
            // 再渲染一次，那一次就是半翻译、丢样式的状态。
            bumpSeatGeneration()
            for (const dispose of disposeSeeds) dispose()
            disposeLeading()
            for (const dispose of disposeColumns) dispose()
            disposeRegistration()
          }
        })

        // 导航配置页：注册进 `main`（keyed 槽，用自己的唯一 key，不与产品页冲突）。
        // 唯一入口是轨道左下角的「导航配置」，它只做 `selectPanel(NAV_CONFIG_ID)`。
        //
        // `main` 条目的组件 props 由 ui-layout 提供，不含本壳的注入面，所以这里用闭包
        // 直接捕获 `injectProps()` 的结果，而不是把它当作 props 读。
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: NAV_CONFIG_ID },
          function HostedNavConfig() {
            return h(NavConfigPage, injectProps())
          },
        ))

        // 入口只有侧栏底部那一个。
        //
        // 这里曾把同一入口再注册进 `settings.section`，于是 DSH 的设置弹窗里多出第二份
        // 「导航配置」。同一个功能两个入口，用户不知道该点哪个；设置面板里的那份还多一层
        // 模态中转（点击后关弹窗、再切主内容区），比直接在轨道底部点一下更绕。
        //
        // 保留轨道底部：它和「插件管理」并列，位置固定、不依赖设置面板是否打开。

        // 占位页已移除：每个产品现在是自己的插件包，页面由该包注册。壳不再
        // 替未注册的产品画占位——那会让「插件没装上」和「页面还没做」长得一样，
        // 而这正是拆包要消除的歧义。
      },
    }
  },
})