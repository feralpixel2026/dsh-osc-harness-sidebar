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

    /** 折叠态产品导航宽度（px）。 */
    const RAIL_COLLAPSED_WIDTH = 56

    /** ui-layout 的 SIDEBAR_MAX：整列宽度的硬上限（px）。 */
    const SIDEBAR_MAX_WIDTH = 420

    /** 保留 id：选中它回到 DSH 会话界面，而不是某个 main 页面。 */
    const CONVERSATION_ID = 'product-conversation'

    const en = {
      'rail.label': 'Products',
      'rail.add': 'Plugin manager',
      'nav.newSession': 'New session',
      'nav.panels': 'Panels',
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
      'config.dragHint': 'Drag ⠿ to reorder; drag a product chip onto another group to move it.',
      'config.unnamed': 'New group',
      'config.viewProducts': 'Show products in this group',
      'config.noProducts': 'No products in this group yet.',
      'config.colName': 'Group',
      'config.colCount': 'Products',
      'config.colVisible': 'Status',
      'config.colOpen': 'Default expanded',
      'config.colActions': 'Actions',
      'config.summary': 'Groups',
      'config.summaryProducts': 'Products',
    }

    const zh = {
      'rail.label': '产品导航',
      'rail.add': '插件管理',
      'nav.newSession': '新会话',
      'nav.panels': '面板',
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
      'config.dragHint': '拖动 ⠿ 调整顺序；把产品拖到别的分组即可改归属。',
      'config.unnamed': '新分组',
      'config.viewProducts': '查看该分组的产品',
      'config.noProducts': '该分组下还没有产品。',
      'config.colName': '分组',
      'config.colCount': '产品数',
      'config.colVisible': '状态',
      'config.colOpen': '默认展开',
      'config.colActions': '操作',
      'config.summary': '分组',
      'config.summaryProducts': '产品',
    }

    const STYLES = `
    .pn-shell { display: flex; height: 100%; min-height: 0; background: var(--dsw-specific-sidebar-fill); }
    /* 产品导航宽度固定，右列吃剩余空间；两列之间没有可拖的把手。 */
    .pn-rail {
      display: flex; flex-direction: column;
      flex: 0 0 ${RAIL_FIXED_WIDTH}px;
      width: ${RAIL_FIXED_WIDTH}px;
      box-sizing: border-box;
      padding: 8px 8px 6px; border-right: 0.5px solid var(--dsw-alias-border-l3);
      background: var(--dsw-specific-sidebar-fill);
      overflow: hidden;
    }
    .pn-rail[data-collapsed] { flex: 0 0 ${RAIL_COLLAPSED_WIDTH}px; width: ${RAIL_COLLAPSED_WIDTH}px; padding: 8px 0 6px; align-items: center; }
    .pn-rail-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
    .pn-rail-scroll::-webkit-scrollbar { display: none; }
    .pn-rail-gap { flex: 1 1 auto; min-height: 8px; }

    /* 品牌行：高 48，与原型 logo 行同口径（左侧留白 8 + inner padding 8）。 */
    /* 品牌行横向预算（轨道 180）：容器左右各留 2px，间距 5px。
       2+2+20(标记)+5+OSCHINA+5+HARNESS ≈ 164 的内容宽里给字标 ~127px，
       比原先的 ~120px 宽出 7px——macOS 的字体度量比 Windows 宽，原先
       12px 按 Windows 量着刚好装下，到 macOS 就被 ellipsis 截成 "OSCHI…"。 */
    .pn-rail-brand {
      display: flex; align-items: center; gap: 5px; flex: 0 0 auto;
      height: 48px; padding: 0 2px; margin-bottom: 4px;
      border: none; border-radius: 8px; background: transparent;
      font: inherit; text-align: left; cursor: pointer;
      overflow: hidden; white-space: nowrap;
    }
    .pn-rail-brand:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
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
    .pn-rail[data-collapsed] .pn-rail-brand { justify-content: center; padding: 0; }
    /* 折叠态只留标志：标签在 56px 宽里会被截成半个词，比不显示更差。 */
    .pn-rail[data-collapsed] .pn-rail-brand-tag { display: none; }

    .pn-group { margin: 0; }
    /* 分组标题：高 30、12px/500、上下留白对齐原型的 margin: 10px 0 2px。 */
    .pn-group-label {
      display: flex; align-items: center; gap: 8px; width: 100%; height: 30px;
      margin: 10px 0 2px; padding: 0 8px;
      border: none; border-radius: 8px; background: transparent;
      color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px; font-weight: 500;
      cursor: pointer; text-align: left; user-select: none;
    }
    .pn-group-label:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
    .pn-group-arrow { display: inline-flex; flex: 0 0 auto; transition: transform .2s cubic-bezier(.42,0,.58,1); transform: rotate(-90deg); }
    .pn-group[data-open] .pn-group-arrow { transform: rotate(0deg); }

    /* 导航行：高 32、13px、圆角 8、下间距 2，与原型 NAV_ROW_STYLE 一致。 */
    .pn-item {
      display: flex; align-items: center; gap: 8px; width: 100%; height: 32px;
      margin-bottom: 2px; padding: 0 8px;
      border: none; border-radius: 8px; background: transparent;
      color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px;
      cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden;
    }
    .pn-item:hover { background: var(--dsw-specific-sidebar-nav-item-hover); color: var(--dsw-alias-label-primary); }
    .pn-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
    .pn-item[data-active] {
      background: var(--dsw-specific-sidebar-nav-item-active);
      color: var(--dsw-alias-label-primary); font-weight: 500;
    }
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
    .pn-foot-button {
      display: flex; align-items: center; width: 100%;
      padding: 6px 8px; border: none; border-radius: 7px; background: transparent;
      color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px;
      cursor: pointer; text-align: left;
    }
    .pn-foot-button:hover { background: var(--dsw-specific-sidebar-nav-item-hover); color: var(--dsw-alias-label-primary); }
    .pn-rail[data-collapsed] .pn-foot-button { justify-content: center; padding: 6px 0; }
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
     * 但内边距不给：本容器的子元素各自带水平留白（.pn-brand 12、.pn-panels 8、
     * .pn-new margin 8），外围再加一层就是双倍，比不齐更难看。原生 .root 加
     * padding 是因为它的子元素是零边距的，形态不同，不能照抄。 */
    .pn-nav {
      --dsh-sidebar-inline-padding: 8px;
      --dsh-sidebar-row-padding: 12px;
      --dsh-sidebar-label-gap: 6px;
      --dsh-sidebar-paint-inset: 3px;
      --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
      --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
      display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0;
      padding: 6px 0;
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
    .pn-brand {
      display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
      padding: 10px 12px 6px; color: var(--dsw-alias-label-primary);
    }
    .pn-brand-mark { display: inline-flex; flex: 0 0 auto; }
    .pn-brand-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 13px; font-weight: 600;
    }
    .pn-new {
      display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
      margin: 2px 8px 6px; padding: 7px 10px; border-radius: 8px;
      border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
      color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
      cursor: pointer; text-align: left;
    }
    .pn-new:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
    .pn-panels { display: flex; flex-direction: column; flex: 0 0 auto; gap: 1px; padding: 2px 8px 6px; }
    .pn-panel {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px;
      border: none; border-radius: 7px; background: transparent;
      color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px;
      cursor: pointer; text-align: left;
    }
    .pn-panel:hover { background: var(--dsw-specific-sidebar-nav-item-hover); color: var(--dsw-alias-label-primary); }
    .pn-panel[data-active] { background: var(--dsw-specific-sidebar-nav-item-active); color: var(--dsw-alias-label-primary); }
    .pn-panel-glyph { display: inline-flex; flex: 0 0 auto; }
    .pn-panel-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* 工作区区域。
     *
     * ui-workspace 的 WorkspaceBrowser 自己只设 padding-right（取
     * --dsh-session-list-edge-inset），**左侧内边距由外层容器提供**——原生是靠
     * .root 的 padding: 6px 8px。我们替掉 .root 后左边界没了，于是工作区那行
     * （含右侧搜索/设置/展开三个图标）整体左移贴边，与原生错开一个 inline padding。
     *
     * 所以这里要补的是**内边距**，同时把那几个局部变量也给出：下游按变量算右侧
     * 内缩量，变量缺失会让右边的图标再错一次。 */
    .pn-region {
      --dsh-sidebar-inline-padding: 8px;
      --dsh-sidebar-row-padding: 12px;
      --dsh-sidebar-label-gap: 6px;
      --dsh-sidebar-paint-inset: 3px;
      --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
      --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
      display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden;
      padding: 0 var(--dsh-sidebar-inline-padding);
      box-sizing: border-box;
    }
    .pn-foot { display: flex; flex-direction: column; flex: 0 0 auto; gap: 2px; padding: 6px 8px 10px; }
    .pn-collapsed-new, .pn-collapsed-panel {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; flex: 0 0 32px; padding: 0;
      border: none; border-radius: 8px; background: transparent;
      color: var(--dsw-alias-label-secondary); font: inherit; font-size: 16px; cursor: pointer;
    }
    .pn-collapsed-new:hover, .pn-collapsed-panel:hover {
      background: var(--dsw-specific-sidebar-nav-item-hover); color: var(--dsw-alias-label-primary);
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
    .pn-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .pn-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .pn-btn-primary:hover { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }

    /* 行式列表：每行一张白卡，行间 10px 由 borderSpacing 给出。 */
    .pn-table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
    .pn-table thead th {
      padding: 0 12px 4px; text-align: left;
      font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-quaternary); white-space: nowrap;
    }
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
    .pn-table tbody tr:hover td { background: var(--dsw-specific-sidebar-nav-item-hover); }
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
     * 拖动热区。原来的 ⠿ 字形只有 14px 宽，鼠标偏一两像素就落到文字上，变成选中文本
     * 而不是拖动。现在把手柄做成填满整格的 40×40 区域：形状仍是那六个点，但可点的
     * 范围覆盖整格，且 user-select 关掉，误触也不会选中文字。
     */
    .pn-cell-handle { width: 48px; padding: 4px 0 4px 8px; text-align: center; }
    .pn-handle {
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 6px;
      cursor: grab; user-select: none; -webkit-user-select: none;
      color: var(--dsw-alias-label-quaternary); font-size: 15px; line-height: 1;
      transition: background .15s, color .15s;
    }
    .pn-handle:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); }
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

    .pn-cell-count { width: 96px; white-space: nowrap; }
    .pn-count-btn {
      padding: 2px 8px; border: none; border-radius: 6px; cursor: pointer;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 13px; font-variant-numeric: tabular-nums;
    }
    .pn-count-btn:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); color: var(--dsw-alias-brand-primary); }

    .pn-cell-state, .pn-cell-open { width: 112px; white-space: nowrap; }
    .pn-switch { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .pn-switch input { margin: 0; cursor: pointer; accent-color: var(--dsw-alias-brand-primary); }
    .pn-switch input:disabled { cursor: not-allowed; }
    .pn-switch-text { font-size: 13px; color: var(--dsw-alias-label-tertiary); }

    .pn-cell-actions { width: 80px; text-align: right; white-space: nowrap; }
    /* 空操作格用零高占位撑住宽度，与有按钮的行同宽。 */
    .pn-actions-placeholder { display: inline-block; width: 28px; height: 1px; }
    /* 名称与其后的改名图标。图标默认淡出，hover 名称区时显现——常驻可见会让每一行都多一个
       视觉重物，而改名是低频操作。 */
    .pn-name-wrap { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
    .pn-rename {
      display: inline-flex; align-items: center; justify-content: center;
      flex: 0 0 auto; width: 20px; height: 20px; padding: 0;
      border: none; border-radius: 4px; background: transparent;
      color: var(--dsw-alias-label-quaternary); cursor: pointer;
      opacity: 0; transition: opacity .15s, background .15s, color .15s;
    }
    .pn-row:hover .pn-rename, .pn-rename:focus-visible { opacity: 1; }
    .pn-rename:hover { background: var(--dsw-specific-sidebar-nav-item-hover); color: var(--dsw-alias-brand-primary); }
    .pn-link {
      padding: 2px 6px; border: none; border-radius: 6px; cursor: pointer;
      background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 13px;
    }
    .pn-link:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }
    .pn-link-danger { color: var(--dsw-alias-label-quaternary); }
    .pn-link-danger:hover { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent); }

    /* 展开后的产品子行：贴在分组行下方，不重复画卡边。 */
    .pn-subrow td {
      padding: 0 12px 12px; background: var(--dsw-alias-bg-layer-1);
      border-left: 1px solid var(--dsw-alias-border-l2); border-right: 1px solid var(--dsw-alias-border-l2);
      border-bottom: 1px solid var(--dsw-alias-border-l2); border-radius: 0 0 8px 8px;
      border-top: none;
    }
    .pn-subcell { font-size: 13px; color: var(--dsw-alias-label-tertiary); }
    .pn-chips { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 4px; }
    .pn-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px;
      border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
      font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: grab;
    }
    .pn-chip:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
    .pn-chip input { margin: 0; cursor: pointer; accent-color: var(--dsw-alias-brand-primary); }

    .pn-cfg-foot {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      margin-top: 4px; font-size: 13px; color: var(--dsw-alias-label-quaternary);
    }
    .pn-cfg-tip { color: var(--dsw-alias-label-quaternary); }
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
    const { useCallback, useRef, useState, useSyncExternalStore } = React

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

    const GLYPH_COMPONENTS = Object.fromEntries(
      Object.entries(GLYPHS).map(([key, path]) => [key, glyph(path)]),
    )

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
    function readNavConfig() {
      try {
        const raw = window.localStorage.getItem(NAV_CONFIG_KEY)
        if (raw === null || raw === '') return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
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
      navConfigListeners.forEach((listener) => { listener() })
    }

    /** Listeners notified after a write; the component subscribes through `useSyncExternalStore`. */
    const navConfigListeners = new Set()

    /** Subscribe to config changes. @returns the unsubscribe function. */
    function subscribeNavConfig(listener) {
      navConfigListeners.add(listener)
      return () => { navConfigListeners.delete(listener) }
    }

    /** Current config for `useSyncExternalStore`; a stable object per write keeps it cheap. */
    let navConfigCache
    let navConfigCacheSource
    function getNavConfigSnapshot() {
      const raw = (() => {
        try {
          return window.localStorage.getItem(NAV_CONFIG_KEY) ?? ''
        } catch {
          return ''
        }
      })()
      if (navConfigCache === undefined || navConfigCacheSource !== raw) {
        navConfigCacheSource = raw
        navConfigCache = readNavConfig()
      }
      return navConfigCache
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
      const fallback = sections.length === 0 ? null : sections[0].id
      const resolve = (id) => {
        const assigned = typeof stored[id] === 'string' ? stored[id] : DEFAULT_GROUP_OF[id]
        if (assigned !== undefined && ids.has(assigned)) return assigned
        return fallback
      }
      return products.map((entry) => ({ ...entry, section: resolve(entry.id) }))
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
    function NavConfigPage(props) {
      const t = props.t
      const config = props.useNavConfig((value) => value)
      const products = typeof props.useProducts === 'function' ? props.useProducts((rows) => rows) : []
      // includeHidden: this page owns the visibility checkbox. Filtering hidden rows out here
      // would delete the only control that can bring a group back.
      const sections = resolveSections(config, t, true)
      const grouped = resolveGrouping(config, sections, products)
      const hiddenSections = Array.isArray(config.hiddenSections) ? config.hiddenSections : DEFAULT_HIDDEN_SECTIONS
      const hiddenProducts = Array.isArray(config.hiddenProducts) ? config.hiddenProducts : []

      const [openSections, setOpenSections] = useState(
        Array.isArray(config.openSections) && config.openSections.length > 0 ? config.openSections : ['g-ai'])
      // 正在编辑名称的分组 id；null 表示没有行处于编辑态。
      const [editing, setEditing] = useState(null)
      const [draftLabel, setDraftLabel] = useState('')
      // 拖动中的分组 id、拖动中的产品 id，以及当前落点分组 id。
      const [dragging, setDragging] = useState(null)
      const [draggingProduct, setDraggingProduct] = useState(null)
      const [overRow, setOverRow] = useState(null)
      // 展开查看某个分组内的产品。
      const [expanded, setExpanded] = useState(null)

      /** 写一份新的配置，字段整体替换而不是合并，避免删掉的项残留。 */
      const save = (patch) => { writeNavConfig({ ...readNavConfig(), ...patch }) }
      const orderIds = () => sections.map((section) => section.id)

      /** 把 from 移到 to 的位置。 */
      /**
       * 把 from 移到 to 当前占据的位置。
       *
       * 先移除再插入，所以 from 原本在 to 之前时，移除会让 to 左移一格，插入点要
       * 相应减一；不减的话一半的拖动组合都会多走一格（10/20 实测）。
       */
      const reorder = (from, to) => {
        if (from === null || to === null || from === to) return
        const order = orderIds()
        const source = order.indexOf(from)
        const target = order.indexOf(to)
        if (source === -1 || target === -1) return
        order.splice(source, 1)
        order.splice(source < target ? target - 1 : target, 0, from)
        save({ sectionOrder: order })
      }

      /** 新建分组：追加到末尾并立即进入改名态。 */
      const addGroup = () => {
        const id = 'g-custom-' + Date.now().toString(36)
        const custom = Array.isArray(config.customSections) ? config.customSections : []
        // 新分组立即展开：一个刚创建、里面还没有产品的分组如果默认收起，在轨道上只剩
        // 一行标题，和「没生效」长得一样。
        const open = Array.isArray(config.openSections) ? config.openSections : []
        save({
          customSections: [...custom, { id, label: t('config.unnamed') }],
          sectionOrder: [...orderIds(), id],
          openSections: open.includes(id) ? open : [...open, id],
        })
        setOpenSections((current) => (current.includes(id) ? current : [...current, id]))
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

      /** 把产品移到别的分组。 */
      const moveProduct = (productId, toSection) => {
        const stored = { ...(config.productGroups ?? {}) }
        stored[productId] = toSection
        save({ productGroups: stored })
      }

      /** 一行一个分组：拖动排序、双击改名、右侧计数与操作。 */
      const row = (section, index) => {
        // Identify the anchor by id, not by `labelKey`: a user-created group also has a null
        // `labelKey`, and keying off that made every custom group behave like the anchor — no
        // title drawn, and its visibility / expand switches locked as if it were the anchor.
        const isDefault = section.id === 'g-default'
        const hidden = hiddenSections.includes(section.id)
        const items = grouped.filter((entry) => entry.section === section.id)
        const isEditing = editing === section.id
        const isExpanded = expanded === section.id
        const rowClass = ['pn-row']
        if (dragging === section.id) rowClass.push('is-dragging')
        // 落点提示用「插入线」而不是整行高亮：拖动时用户关心的是**会插到哪一条的
        // 上沿还是下沿**，整行变色说不出这件事。before / after 由光标在行的上半还是
        // 下半决定，松手时按同一判定插入。
        if (overRow !== null && overRow.id === section.id && dragging !== null && dragging !== section.id) {
          rowClass.push(overRow.position === 'before' ? 'is-drop-before' : 'is-drop-after')
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
            // Accept both a group row (reorder) and a product chip (change ownership).
            if (dragging === null && draggingProduct === null) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const position = positionIn(event)
            if (overRow === null || overRow.id !== section.id || overRow.position !== position) {
              setOverRow({ id: section.id, position })
            }
          },
          onDragLeave: (event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return
            setOverRow((current) => (current !== null && current.id === section.id ? null : current))
          },
          onDrop: (event) => {
            event.preventDefault()
            if (draggingProduct !== null) {
              moveProduct(draggingProduct, section.id)
            } else if (dragging !== null) {
              // 光标在下半 = 插到本行之后；reorder 按「移到某行位置」语义，
              // 所以 after 要换算成下一行的 id，末行则移到自己即保持原位。
              if (positionIn(event) === 'after') {
                const nextSection = sections[index + 1]
                reorder(dragging, nextSection === undefined ? section.id : nextSection.id)
              } else {
                reorder(dragging, section.id)
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
        // 名称列：编辑态给输入框，静态态给文字 + 双击进入编辑
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
              // 改名入口：名称后面一支铅笔。
              //
              // 此前只有双击名称，没有任何可见提示，用户找不到。图标贴着名称而不是放进操作
              // 列，因为操作列的内容各不同（默认分组没有删除按钮），放进去那一列宽度会在行与
              // 行之间不一致，表头随之错位。
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
        // 产品数：点开看组内产品，可勾选显隐
        h('td', { className: 'pn-cell-count' },
          h('button', {
            type: 'button',
            className: 'pn-count-btn',
            onClick: () => { setExpanded(isExpanded ? null : section.id) },
            title: t('config.viewProducts'),
          }, String(items.length), isExpanded ? ' ▾' : ' ▸')),
        // 状态列：显示 / 隐藏
        h('td', { className: 'pn-cell-state' },
          h('label', { className: 'pn-switch' },
            h('input', {
              type: 'checkbox',
              checked: !hidden,
              disabled: isDefault,
              onChange: (event) => {
                const next = event.target.checked
                  ? hiddenSections.filter((id) => id !== section.id)
                  : [...hiddenSections, section.id]
                save({ hiddenSections: next })
              },
            }),
            h('span', { className: 'pn-switch-text' },
              hidden ? t('config.hidden') : t('config.visible')))),
        // 默认展开列。默认分组固定常显，不能收起：它是没有业务域归属的落点，收起来
        // 会让那些产品无处可去。
        h('td', { className: 'pn-cell-open' },
          h('label', { className: 'pn-switch' },
            h('input', {
              type: 'checkbox',
              checked: isDefault || openSections.includes(section.id),
              disabled: isDefault,
              onChange: (event) => {
                const next = event.target.checked
                  ? [...openSections, section.id]
                  : openSections.filter((id) => id !== section.id)
                setOpenSections(next)
                save({ openSections: next })
              },
            }),
            h('span', { className: 'pn-switch-text' }, t('config.open')))),
        // 操作列：只有删除。改名的入口在名称后面那个小图标上，不占这一列——
        // 放进操作列会让这一列在不同行之间宽度不一致（默认分组没有按钮），
        // 表头与单元格随之错位。
        h('td', { className: 'pn-cell-actions' },
          isDefault || sections.length <= 1
            ? h('span', { className: 'pn-actions-placeholder', 'aria-hidden': 'true' })
            : h('button', {
              type: 'button',
              className: 'pn-link pn-link-danger',
              onClick: () => { removeGroup(section.id) },
              title: t('config.remove'),
            }, t('config.remove')))
        )
      }

      /** 组展开后的产品子行：勾选显隐，可拖到别的分组。 */
      const productRow = (section) => {
        const items = grouped.filter((entry) => entry.section === section.id)
        if (items.length === 0) {
          return h('tr', { key: section.id + '-empty', className: 'pn-subrow' },
            h('td', { colSpan: 6, className: 'pn-subcell' }, t('config.noProducts')))
        }
        return h('tr', { key: section.id + '-sub', className: 'pn-subrow' },
          h('td', { colSpan: 6, className: 'pn-subcell' },
            h('div', { className: 'pn-chips' },
              items.map((entry) => h('label', {
                key: entry.id,
                className: 'pn-chip',
                draggable: true,
                onDragStart: (event) => {
                  event.stopPropagation()
                  // 产品拖动单独记录，落点时据此区分「改归属」与「排序分组」。
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', 'product:' + entry.id)
                  setDraggingProduct(entry.id)
                },
                onDragEnd: () => { setDraggingProduct(null); setOverRow(null) },
              },
              h('input', {
                type: 'checkbox',
                checked: !hiddenProducts.includes(entry.id),
                onChange: (event) => {
                  const next = event.target.checked
                    ? hiddenProducts.filter((id) => id !== entry.id)
                    : [...hiddenProducts, entry.id]
                  save({ hiddenProducts: next })
                },
              }),
              h('span', {}, entry.label))))))
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
              writeNavConfig({
                hiddenSections: DEFAULT_HIDDEN_SECTIONS,
                openSections: ['g-ai'],
              })
              setOpenSections(['g-ai'])
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
          h('tbody', {}, sections.flatMap((section) => {
            const rows = [row(section)]
            if (expanded === section.id) rows.push(productRow(section))
            return rows
          }))),
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
    function ProductSidebar(props) {
      const { collapsed, drawer, renderSlot, t } = props
      const wide = drawer || !collapsed
      const activePanel = props.usePanelInfo((info) => info.activePanelId)
      const attachSolo = useSoloTrack()
      // 两列宽度：产品导航固定 RAIL_FIXED_WIDTH，右列吃掉整列剩下的部分。
      //
      // 不按 `props.width` 做比例分配，也不提供拖拽。ui-layout 默认列宽 280、
      // 上限 420；曾经的「按预算缩放 + 可拖」让产品导航被压到 95~148px，产品
      // 列表缩成一行图标。固定宽度是唯一稳定的行为。
      const columnPx = typeof props.width === 'number' && props.width > 0 ? props.width : SIDEBAR_MAX_WIDTH
      const railPx = wide ? RAIL_FIXED_WIDTH : RAIL_COLLAPSED_WIDTH
      const navPx = wide ? Math.max(0, columnPx - railPx) : 0

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
      const hasOwnNav = contentKeys.includes(activeId)
      // 插件诉求：这条产品声明了要右列才显示。与 `hasOwnNav`（有没有注册
      // 内容）是两个独立事实，壳只按诉求决定，不替产品推断。
      const columnIds = typeof props.useColumnIds === 'function' ? props.useColumnIds((rows) => rows) : []
      const wantsColumn = (id) => id === CONVERSATION_ID || columnIds.includes(id)

      // 导航偏好：配置页写、轨道读，两边共用同一份快照。
      const navConfig = props.useNavConfig((config) => config)

      // 分组收展：默认展开集合来自配置，没有配置时回到「只展开 AI 域」的原型行为。
      const [openSections, setOpenSections] = useState(() =>
        Array.isArray(navConfig.openSections) && navConfig.openSections.length > 0
          ? navConfig.openSections
          : ['g-ai'])
      const toggleSection = (id) => setOpenSections((current) =>
        current.includes(id) ? current.filter((x) => x !== id) : [...current, id])

      // 应用配置后的分组表：顺序、名称、显隐都在这里生效。
      const sections = resolveSections(navConfig, t)
      const hiddenProducts = Array.isArray(navConfig.hiddenProducts) ? navConfig.hiddenProducts : []

      // 隐藏分组只隐藏**分组标题**，组内产品要并入默认分组继续可见——用户藏的是一个
      // 标题，不是一个功能入口。归组按产品的原始归属判断（此时产品已被归到默认分组）。
      const hiddenSectionIds = new Set(
        Array.isArray(navConfig.hiddenSections) ? navConfig.hiddenSections : [],
      )
      const originalGroupOf = (id) => {
        const stored = navConfig.productGroups
        const assigned = stored !== null && typeof stored === 'object' && typeof stored[id] === 'string'
          ? stored[id]
          : DEFAULT_GROUP_OF[id]
        return assigned
      }

      // 产品归组：注册项不带组别，组别来自配置，出厂默认兜底。
      // 所属分组被隐藏的产品改挂默认分组，并且排到该组已有产品之后——`order` 决定组内
      // 位置，沿用原位会让它们插进默认分组中间。
      const defaultSection = sections.length === 0 ? null : sections[0].id
      const assignedRows = resolveGrouping(navConfig, sections, products).map((entry) => {
        if (!hiddenSectionIds.has(originalGroupOf(entry.id)) || defaultSection === null) return entry
        return { ...entry, section: defaultSection }
      })

      // 组内排序用：并入默认分组的行排在原有行之后，并保持它们彼此的相对顺序。
      const relocated = assignedRows.filter((entry) => hiddenSectionIds.has(originalGroupOf(entry.id)))
      const relocatedIds = new Set(relocated.map((entry) => entry.id))
      const settledMax = assignedRows
        .filter((entry) => !relocatedIds.has(entry.id))
        .reduce((max, entry) => Math.max(max, entry.order ?? 0), 0)
      const grouped = assignedRows.map((entry) => {
        if (!relocatedIds.has(entry.id)) return entry
        // 逐个累加，避免同一批并入的产品挤到同一个 order 后顺序不稳。
        const index = relocated.findIndex((candidate) => candidate.id === entry.id)
        return { ...entry, order: settledMax + index + 1 }
      })

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
        const ownRow = id !== CONVERSATION_ID && id !== 'plugins'
        setPickedRail(ownRow ? id : null)
        props.selectRail(id)
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
          padding: wide ? '8px 8px 6px' : '8px 0 6px',
          background: 'var(--dsw-specific-sidebar-fill)',
          overflow: 'hidden',
          ...(wide ? {} : { alignItems: 'center' }),
        },
        'aria-label': t('rail.label'),
        ...(railPx === RAIL_COLLAPSED_WIDTH ? { 'data-collapsed': '' } : {}),
      },
      // 品牌行：整列的收展开关交给 ui-layout 自己的按钮，这里只做展示。
      //
      // 三段式对齐右侧原生品牌：[OSCHINA 标志] [字标] [HARNESS 标签]。
      // 标签照原生做法做成实心反色块；字标降到 12px 以适应 180px 窄轨。
      //
      // 标志是绿色圆角方块 + 白色 C 形环，与参考图一致。C 的几何从给的图里量出来
      // （外半径 16.65、内半径 6.50、右侧 35° 缺口，逐点比对 95.3% 吻合），
      // 用两条圆弧画而不是描像素——原图是 JPEG，描边会带进压缩锯齿。
      h('div', { className: 'pn-rail-brand', 'aria-label': t('brand.fallback') },
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
        sections.map((section) => {
          // 组内按注册顺序排。`grouped` 是 products 的映射结果，其顺序来自插件注册先后，
          // 与产品在该组里的位置无关；不排序时，凡是靠后注册却归入这个组的产品会排到前面。
          const items = grouped
            .filter((entry) => entry.section === section.id)
            .filter((entry) => !hiddenProducts.includes(entry.id))
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
          // 空分组仍画标题：新增分组后整组消失会让人以为"没生效"。
          // Same reason as the config page: id, not `labelKey`.
          const isDefault = section.id === 'g-default'
          const open = isDefault || openSections.includes(section.id)
          return h('div', {
            key: section.id,
            className: 'pn-group',
            ...(open ? { 'data-open': '' } : {}),
          },
          // 分组标题始终渲染（默认分组除外），空分组也保留标题。
          isDefault || !wide
            ? null
            : h('button', {
              type: 'button',
              className: 'pn-group-label',
              onClick: () => { toggleSection(section.id) },
            },
            h('span', { className: 'pn-group-text' }, section.label),
            // 原型是 6px 实心三角，紧跟文字；展开朝下、收起朝右。
            h('span', { className: 'pn-group-arrow', 'aria-hidden': 'true' },
              h('svg', { viewBox: '0 0 24 24', width: '6', height: '6' },
                h('path', { d: 'M12 16 4 6h16z', fill: 'currentColor' })))),
          isDefault || open
            ? items.map((entry) => h('button', {
              key: entry.id,
              type: 'button',
              className: 'pn-item',
              title: wide ? undefined : entry.label,
              'aria-label': entry.label,
              'aria-current': activeId === entry.id ? 'page' : undefined,
              'data-active': activeId === entry.id ? '' : undefined,
              onClick: () => { selectRail(entry.id) },
            },
            h('span', { className: 'pn-item-glyph', 'aria-hidden': 'true' },
              renderSlot(section.slot, { size: 18, active: activeId === entry.id }, { only: entry.id })),
            h('span', { className: 'pn-item-label' }, entry.label)))
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
        h('span', { className: 'pn-foot-label' }, t('rail.add'))),
        // 导航配置：与设置面板里的那一项是同一个页面，两个入口指向同一个 main key。
        h('button', {
          type: 'button',
          className: 'pn-foot-button',
          title: t('rail.configure'),
          'aria-label': t('rail.configure'),
          'data-active': activeId === NAV_CONFIG_ID ? '' : undefined,
          onClick: () => { selectRail(NAV_CONFIG_ID) },
        },
        h('span', { className: 'pn-foot-label' }, t('rail.configure'))),
        // 页脚扩展位：登录等插件注册到这里，「插件管理」正下方。
        h('div', { className: 'pn-rail-account' },
          renderSlot('sidebar.rail.account', { wide: true }))))

      // 只有 ui-layout 真正把整列折叠时才走紧凑轨；产品导航自己的折叠不算，
      // 那种情况仍要渲染完整双列（左图标列 + 右导航列）。
      if (!wide) {
        // 折叠态：只留产品导航，外加原侧栏在这一列保留的紧凑控件。
        return h('div', {
          className: 'pn-shell',
          style: { display: 'flex', height: '100%', minHeight: 0, background: 'var(--dsw-specific-sidebar-fill)' },
        },
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
      // `gridTemplateColumns` 写死，ILayout 也没有宽度 setter。插件改不了那个
      // 内联值，但它不带 `!important`——所以由 CORE_CSS 里一条作用在根元素上的
      // `:has()` 规则接管：认出 solo 态后把第一列压到产品轨的固定宽度，轨道收缩，
      // 主内容区自然左移，不留同色空条也不用改官方包。
      const wantsOwnColumn = !isDshPanelActive && !wantsColumn(activeId)

      if (wantsOwnColumn) {
        return h('div', {
          className: 'pn-shell',
          'data-product-nav': '',
          'data-solo': '',
          ref: attachSolo,
        }, rail)
      }

      // DSH 面板激活时右列仍是 DSH 的工作区导航，所以按会话分支渲染。
      const showDshNav = isDshPanelActive || activeId === CONVERSATION_ID

      const rightColumn = showDshNav
        ? h(React.Fragment, null,
          h('div', { className: 'pn-brand', 'data-window-drag': true },
            h('span', { className: 'pn-brand-mark', 'aria-hidden': 'true' },
              renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: null })),
            h('span', { className: 'pn-brand-name' },
              renderSlot('sidebar.brand.name', {}, { fallback: t('brand.fallback') }))),
          h('button', {
            type: 'button',
            className: 'pn-new',
            onClick: () => { props.startSession() },
          }, h('span', { 'aria-hidden': 'true' }, '+'), h('span', null, t('nav.newSession'))),
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
                renderSlot('sidebar.panellist', { size: 16, active: activePanel === panel.id }, { only: panel.id })),
              h('span', { className: 'pn-panel-label' }, panel.label))))
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
          padding: '0 8px',
          boxSizing: 'border-box',
        },
      },
            renderSlot('sidebar.workspaces', {
              wide: true,
              expandSidebar: () => { if (collapsed) props.toggleSidebar() },
            })),
          h('div', { className: 'pn-foot' },
            renderSlot('sidebar.footer.action', { wide: true }),
            renderSlot('sidebar.settings', { wide: true })))
        // 产品自己注册了二级导航，本文件不代画。
        : renderSlot('sidebar.content', { wide: true, collapsed, activePanelId: activePanel },
          { entryKey: activeId })

      return h('div', {
        className: 'pn-shell',
        'data-product-nav': '',
        style: { display: 'flex', height: '100%', minHeight: 0, background: 'var(--dsw-specific-sidebar-fill)' },
      },
        rail,
        h('div', {
          className: 'pn-nav',
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            flexBasis: `${navPx}px`,
            minWidth: 0,
            minHeight: 0,
            padding: '6px 0',
            boxSizing: 'border-box',
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
     * ui-layout's AppFrame writes `gridTemplateColumns` as an inline style and
     * exposes no width setter, so a slot occupant cannot ask it for a narrower
     * column. The inline declaration is still only an inline declaration: it can
     * be replaced, and that is all this does.
     *
     * **Why the baseline lives in a DOM attribute.** Disabling a plugin removes
     * its slot registrations; it does not unmount the React root (`root.unmount`
     * only runs when the whole renderer tears down). So when this plugin is
     * disabled, neither the callback ref nor an effect cleanup is guaranteed to
     * run — React simply stops rendering the component. A previous version kept
     * the saved value in a ref, which meant:
     *
     *   enable → write the narrowed track, hold the old value in a ref
     *   disable while a non-solo product is selected → ref never fires, the
     *   narrowed track stays in the DOM, and the ref holding the real baseline
     *   is gone with the component
     *   enable again → reads the narrowed value as "previous", so the column
     *   narrows by another rail width; repeat until it collapses
     *
     * That is the reported "works the first time, not after". Persisting the
     * baseline on the grid element itself makes it survive any number of
     * enable/disable cycles, because the element outlives the plugin: whatever
     * instance is running can read the true baseline back and restore it.
     *
     * The grid container is not identified by class name (CSS Modules hashes
     * them). It is the nearest ancestor that actually carries the property, so
     * the lookup holds however many wrappers ui-layout adds.
     *
     * @returns a callback ref to attach to the solo shell.
     */
    const SOLO_TRACK_ATTR = 'data-pn-track-baseline'

    function useSoloTrack() {
      const restoreRef = useRef(null)

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

        // The baseline is whatever the column had before this plugin ever wrote
        // to it. An attribute we set earlier is authoritative; the element's own
        // current value is only a baseline if it is not our own narrowed track.
        const current = grid.style.gridTemplateColumns
        const narrowed = `${RAIL_FIXED_WIDTH}px minmax(0px, 1fr) minmax(0px, 0px)`
        const recorded = grid.getAttribute(SOLO_TRACK_ATTR)
        const baseline = recorded !== null
          ? recorded
          : (current === narrowed ? '' : current)
        if (recorded === null) grid.setAttribute(SOLO_TRACK_ATTR, baseline)

        grid.style.gridTemplateColumns = narrowed
        grid.setAttribute('data-animating', '')
        restoreRef.current = () => {
          // Empty string hands the track back to ui-layout's own stylesheet.
          grid.style.gridTemplateColumns = baseline
          grid.removeAttribute('data-animating')
        }
      }, [])

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
      inject: ['slots', 'layout', 'locale'],

      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'product-nav: dictionaries')
        const t = ctx.locale.bind(NS)

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
        const projectRail = () => ctx.slots.entriesOfSlot(PRODUCT_SLOT).map((entry) => ({
          id: String(entry.options.id ?? entry.options.key ?? ''),
          order: entry.options.order ?? 0,
          label: labelOf(entry.options.label, String(entry.options.id ?? entry.options.key ?? '')),
        }))
        const invalidateRail = () => { cachedRail = undefined }
        const products = {
          getSnapshot: () => { cachedRail ??= projectRail(); return cachedRail },
          subscribe: (listener) => {
            // 旧的分组槽位也订阅：迁移期若有包仍注册进 `g-*`，列表要跟着刷新。
            const offs = [PRODUCT_SLOT, ...SECTIONS.map((section) => section.slot)]
              .filter((slot, index, all) => all.indexOf(slot) === index)
              .map((slot) => ctx.slots.subscribe(slot, () => { invalidateRail(); listener() }))
            return () => { invalidateRail(); for (const off of offs) off() }
          },
        }

        let cachedPanels
        const projectPanels = () => ctx.slots.entriesOfSlot('sidebar.panellist').map((entry) => ({
          id: String(entry.options.id),
          order: entry.options.order ?? 0,
          label: labelOf(entry.options.label, String(entry.options.id)),
        }))
        const invalidatePanels = () => { cachedPanels = undefined }
        const panels = {
          getSnapshot: () => { cachedPanels ??= projectPanels(); return cachedPanels },
          subscribe: (listener) => {
            const off = ctx.slots.subscribe('sidebar.panellist', () => { invalidatePanels(); listener() })
            return () => { invalidatePanels(); off() }
          },
        }

        let cachedContentKeys
        const projectContentKeys = () => ctx.slots.entriesOfSlot('sidebar.content')
          .map((entry) => String(entry.options.key))
        const invalidateContentKeys = () => { cachedContentKeys = undefined }
        const contentKeys = {
          getSnapshot: () => { cachedContentKeys ??= projectContentKeys(); return cachedContentKeys },
          subscribe: (listener) => {
            const off = ctx.slots.subscribe('sidebar.content', () => { invalidateContentKeys(); listener() })
            return () => { invalidateContentKeys(); off() }
          },
        }

        // 右列诉求：产品插件往 `sidebar.columns` 注册一行，id 与产品轨 id 相同，
        // 表示「选中我时保留右列」。没声明就不显示——注册内容与声明诉求是两件
        // 事，壳只认声明。
        let cachedColumnIds
        const projectColumnIds = () => ctx.slots.entriesOfSlot('sidebar.columns')
          .map((entry) => String(entry.options.id))
        const invalidateColumnIds = () => { cachedColumnIds = undefined }
        const columnIds = {
          getSnapshot: () => { cachedColumnIds ??= projectColumnIds(); return cachedColumnIds },
          subscribe: (listener) => {
            const off = ctx.slots.subscribe('sidebar.columns', () => { invalidateColumnIds(); listener() })
            return () => { invalidateColumnIds(); off() }
          },
        }

        // 新会话走 Workspace UI 的共享动作，原侧栏的新会话按钮用的也是它。
        const startSession = () => {
          const workspaceUi = ctx.get('uiWorkspace')
          if (typeof workspaceUi?.startSession === 'function') workspaceUi.startSession()
        }

        const injectProps = () => ({
          startSession,
          toggleSidebar: () => { ctx.layout.toggleSidebar() },
          // `selectPanel` 会在目标 key 未注册时抛错，并**保留原来的选择**。
          // 产品包的 main 注册不保证成功（main 是 keyed 槽，key 集合由已注册的
          // 条目决定，包也可能加载失败），所以这里必须吞掉异常：否则点工作台后
          // `activePanelId` 仍是 null，界面看起来毫无反应。选中态由组件自己的
          // 本地状态兜住。
          selectRail: (id) => {
            try {
              if (id === CONVERSATION_ID) { ctx.layout.selectPanel(null); return }
              ctx.layout.selectPanel(id)
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
              // 页脚扩展位，在「插件管理」正下方。账号/登录状态注册到这里。
              'sidebar.rail.account': { kind: 'list', scope: 'root' },
              'sidebar.panellist': { kind: 'list', scope: 'root' },
              'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
              'sidebar.workspaces': { kind: 'single', scope: 'root' },
              'sidebar.settings': { kind: 'single', scope: 'root' },
              'sidebar.footer.action': { kind: 'list', scope: 'root' },
              'sidebar.brand.mark': { kind: 'single', scope: 'root' },
              'sidebar.brand.name': { kind: 'single', scope: 'root' },
              'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
            },
            inject: injectProps,
          }, function FramedSidebar(props) {
            return h(ProductBoundary, null, h(ProductSidebar, props))
          })

          // 内置行：与产品包一样只往单一汇总槽注册，分组由配置决定，
          // 所以这里不再按 seed.section 挑槽位——否则它会落在没人渲染的旧分组槽里。
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
            for (const dispose of disposeSeeds) dispose()
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
