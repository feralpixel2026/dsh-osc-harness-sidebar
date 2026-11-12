# 写一个产品插件

本外壳不硬编码任何产品。轨道上有哪几行、每行选中后显示什么，全部由插件通过槽位注册决定。

本文是**接入方指南**。四条不可违反的硬性要求另见 [integration.md](integration.md)；本文讲「怎么搭起来」。

---

## 1. 最小可运行插件

一个完整的客户端插件包，注册一行导航和一个页面。

### `lib/client.js`

```js
window.__ModuleLoader__.load({
  id: 'dsh-product-hello',
  factory: (require) => {
    const react = require('react')
    const h = react.createElement
    const ID = 'product-hello'

    return {
      name: 'dsh-product-hello',
      apply(ctx) {
        // 轨道上的一行
        ctx.slots.inject('sidebar.products', () => ctx.slots.register({
          name: 'sidebar.products',
          id: ID,
          order: 100,
          label: 'Hello',
        }, function RailRow() {
          return h('span', null, 'Hello')
        }))

        // 选中后主内容区的页面
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: ID },
          function Page() {
            return h('div', { style: { padding: 24 } }, 'Hello, Harness')
          },
        ))
      },
    }
  },
})
```

**所有声明必须写在 `factory()` 内部。** 写在模块顶层会与热重载时的旧副本重名，整个脚本解析失败，`apply()` 从不运行。详见 [integration.md](integration.md) 第 1 条。

### `lib/index.js`

Host 侧空壳：

```js
export function apply() {}
```

### `package.json`

```json
{
  "name": "dsh-product-hello",
  "version": "1.0.0",
  "type": "module",
  "main": "lib/index.js",
  "dsh": {
    "client": { "entry": "lib/client.js" },
    "bundle": { "patch": "cordis.patch.yml" }
  }
}
```

### `cordis.patch.yml`

```yaml
- insert:
    - id: dsh-product-hello
      name: dsh-product-hello
```

---

## 2. 槽位清单

注册进 `sidebar` 席位后，本插件声明下列子槽位：

| 槽位 | 类型 | 作用 |
|---|---|---|
| `sidebar.products` | list | **产品行**。注册一行 = 轨道上多一项 |
| `sidebar.content` | keyed | **二级导航**。产品被选中时渲染在右列 |
| `sidebar.columns` | list | 声明「我准备了一列」 |
| `sidebar.columns.visible` | list | 声明「这一列现在要占地方」 |
| `sidebar.rail.account` | list | 页脚扩展位，在「插件管理」正下方 |

分组不是槽位：**组别由本插件按行 id 计算**，用户可在导航配置页把任意行拖到任意分组。新插件不需要知道分组 id。

---

## 3. 右列（二级导航）

**两个声明缺一不可。** 只注册 `sidebar.columns` 不会占地方——这是最容易踩的坑。

### 第一步：声明准备了一列

```js
ctx.slots.inject('sidebar.columns', () => ctx.slots.register({
  name: 'sidebar.columns',
  id: ID,
}))
```

### 第二步：声明这一刻占地方

```js
ctx.slots.inject('sidebar.columns.visible', () => ctx.slots.register({
  name: 'sidebar.columns.visible',
  id: ID,
}))
```

### 第三步：提供列内容

```js
ctx.slots.inject('sidebar.content', () => ctx.slots.register({
  name: 'sidebar.content',
  key: ID,
}, function SubNav() {
  return h('nav', null, '二级导航')
}))
```

**为什么拆成两次**：注册选项里本插件只读取 `id` / `label` / `order`（`key` 与 `priority` 由槽位运行时消费，不由本插件读）。插件没有办法在产品行上附带「这一列现在有没有内容」这样的动态信息。内容动态为空时，壳看到的仍是「已声明」，于是留一条空白列。拆开之后，插件能在内容为空时取消 `visible`，壳体不替它猜。

### 收起

注册 `sidebar.columns.collapsed` 即强制收起，优先级最高，不必注销前两者：

```js
ctx.slots.inject('sidebar.columns.collapsed', () => ctx.slots.register({
  name: 'sidebar.columns.collapsed',
  id: ID,
}))
```

---

## 4. 页面宽度：按容器，不按视口

主内容区外面套了一层 `.pn-content-frame`，带 `container-type: inline-size`。用容器查询，不要用视口查询：

```css
/* 错误：右栏展开、DPI 缩放下必然错位 */
@media (max-width: 1240px) { .my-grid { grid-template-columns: 1fr } }

/* 正确 */
@container (max-width: 1240px) { .my-grid { grid-template-columns: 1fr } }
```

原因见 [integration.md](integration.md) 第 4 条。

---

## 5. 注册时机

所有子槽位注册必须写在 `ctx.slots.inject('<槽位名>', ...)` 的回调里，不要在 `apply` 顶层直接注册。

`sidebar.products` 等槽位由本外壳接管 `sidebar` 席位时才存在。`apply` 顶层直接注册会抛 `slot is not declared` 并中断整个 `apply`，表现为左列空白、只有重启才好。

```js
// 错误：等的是父席位，注册的是子席位，谁先触发没有保证
ctx.slots.inject('sidebar', () => {
  ctx.slots.register({ name: 'sidebar.products', id: ID }, Row)
})

// 正确：等谁就 inject 谁
ctx.slots.inject('sidebar.products', () => ctx.slots.register(
  { name: 'sidebar.products', id: ID, order: 100, label: 'Hello' }, Row))
```

多个子槽位就写多次 `inject`，各等各的。

---

## 6. 样式隔离

外壳的 class 全部以 `pn-` 开头。**不要写越界选择器**：

```css
/* 错误：会命中外壳，用户看到的是「导航坏了」 */
html:has(.my-page) .pn-item { background: #000 }

/* 正确：只写自己容器内 */
.my-page .my-nav { background: var(--dsw-alias-bg-layer-1) }
```

颜色读 DSH 主题变量（`--dsw-*`），不要写死。详见 [integration.md](integration.md) 第 3 条。

---

## 7. 图标

产品行的图标由 `sidebar.products` 那一行的 slot 内容提供。本插件以 `renderSlot(section.slot, { size: 18, active }, { only: entry.id })` 渲染，尺寸 18，随选中态切换颜色。

---

## 8. 自检清单

提交前逐条确认：

- [ ] 除 `window.__ModuleLoader__.load({...})` 外，文件最外层没有任何声明
- [ ] 每个子槽位单独 `inject`，没有在 `inject('sidebar')` 回调里同步注册
- [ ] 需要右列时，`sidebar.columns` 与 `sidebar.columns.visible` **都**注册了
- [ ] CSS 只用自己容器的选择器，没有 `html:has(...) .pn-*`
- [ ] 页面宽度用 `@container`，不是 `@media`
- [ ] 颜色读 `--dsw-*` 变量

第 1 条可用 `tools/verify-hot-reloadable.mjs` 机械检查，其余靠自查或评审。