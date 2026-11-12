# 接入 `dsh-osc-harness-sidebar` 的硬性要求

本文件是产品插件接入本外壳的**验收标准**。四条要求都来自真实故障——每一条都写明了
不遵守时会看到什么现象，以及为什么外壳无法替你兜住。

`node tools/verify-hot-reloadable.mjs` 会机械检查第 1 条。其余三条靠自查或评审。

本文只列**不可违反的约束**。逐步搭建教程、可复制的包结构与自检清单见
[writing-a-plugin.md](writing-a-plugin.md)。

---

## 1. 全部声明必须写在 `factory()` 内部

**现象**：插件管理器里显示已启用，但产品行不出现；控制台有
`Uncaught SyntaxError: Identifier 'X' has already been declared`。

**原因**：DSH 每次启用插件都会重新注入 `client.js`，上一次的脚本仍留在页面里。
模块顶层的 `const` / `let` / `class` 与自己的旧副本重名，整个脚本解析失败——
`factory()` 从未被调用，`apply()` 从未运行，自然什么都没注册。

```js
// 错误：模块作用域
const PL_NS = 'productLogin'
window.__ModuleLoader__.load({
  id: 'dsh-product-x',
  factory(require) { ... },
})

// 正确：factory 作用域，每次求值各自独立
window.__ModuleLoader__.load({
  id: 'dsh-product-x',
  factory(require) {
    const PL_NS = 'productLogin'
    ...
  },
})
```

**判定方法**：整个文件除 `window.__ModuleLoader__.load({...})` 外，最外层不得有任何声明。

---

## 2. 每个子席位单独 `inject`，不要在 `inject('sidebar')` 回调里同步注册

**现象**：冷启动（重启 DSH）后产品行消失；手动关掉插件再打开就恢复。控制台有
`web boot: 1 entry did not activate` 和 `<插件 id>: import failed`。

**原因**：`sidebar` 的占用者是本外壳。它在自己的 `inject('sidebar')` 回调里
`register({ children })` 声明子席位。**你的回调与它的回调谁先触发没有保证**——
如果你的 `inject('sidebar')` 回调先跑，此时 `sidebar.products` 还不存在，
`register` 直接抛错，你的客户端入口激活失败。

```js
// 错误：等的是父席位，注册的是子席位
ctx.slots.inject('sidebar', () => {
  ctx.slots.register({ name: 'sidebar.products', id: 'x' }, Row)
})

// 正确：等谁就 inject 谁，子席位出现时回调才会触发
ctx.slots.inject('sidebar.products', () => ctx.slots.register(
  { name: 'sidebar.products', id: 'x', order: 10, label: 'X' }, Row))
```

多个子席位就写多次 `inject`，各等各的。

---

## 3. 不要在样式里越界命中外壳的 DOM

**现象**：打开你的页面后，整个产品导航被改色、布局错乱。

**原因**：外壳的 class 全部以 `pn-` 开头（`.pn-shell` / `.pn-rail` / `.pn-item` …）。
用 `html:has(.your-page) .pn-item { ... }` 这类选择器会命中外壳，用户看到的是"导航插件坏了"，
排查成本却落在你身上。

```css
/* 错误 */
html:has(.sf-page) .pn-rail { background: #000 }

/* 正确：只写自己容器内的选择器 */
.sf-page .sf-nav { background: var(--dsw-alias-bg-layer-1) }
```

颜色一律读 DSH 主题变量（`--dsw-*`），不要写死。

---

## 4. 页面宽度按容器算，不要按视口算

**现象**：页面右侧被裁切，或右侧一片空白；右栏展开、DPI 缩放（125% / 150%）时更明显。

**原因**：主内容区的实际宽度不等于 `window.innerWidth`。右栏会占走一部分，
Electron 的视口也可能比显示器物理宽度更宽。按视口写媒体查询必然错位。

外壳给主内容区套了一层 `.pn-content-frame`，带 `container-type: inline-size`。
用容器查询，不要用视口查询：

```css
/* 错误 */
@media (max-width: 1240px) { .sf-grid { grid-template-columns: 1fr } }

/* 正确：按这一列自己的宽度降列 */
@container (max-width: 1240px) { .sf-grid { grid-template-columns: 1fr } }

/* 同时不要写固定 max-width，让它跟着可用宽度走 */
.sf-page { max-width: 100%; }
```

---

## 右列：什么时候真的占地方

`sidebar.columns` 只表示「我准备了一列」，注册它本身不再占地方，还要声明这一刻要不要显示。

```js
ctx.slots.inject('sidebar.columns.visible', () => ctx.slots.register(
  { name: 'sidebar.columns.visible', id: 'product-x' }))
```

三条判据任一即占：`visible` 有该 id；id 在 legacy 集合里；否则不占列。
`sidebar.columns.collapsed` 优先级最高，注册它即强制收起。

**新插件必须声明 `visible`**，否则看不到列。历史包由壳自动记住（存
`localStorage['dsh.productNav.legacyColumns']`），不声明也继续占列。
