# 文档

本目录存放面向**接入方与贡献者**的说明。根目录只保留 GitHub 社区规范文件。

## 产品插件接入方

如果你在写一个接入本外壳的产品插件（`dsh-product-*`），按这个顺序读：

1. [writing-a-plugin.md](writing-a-plugin.md) —— **逐步指南**。最小可运行插件、完整包结构、槽位清单、右列的三次声明、页面宽度、注册时机、样式隔离、自检清单。
2. [integration.md](integration.md) —— **四条不可违反的硬性要求**。每条都来自真实故障，写明了不遵守时看到什么现象、为什么外壳无法替你兜住。

三者的分工：指南讲「怎么搭起来」，要求讲「哪些线不能踩」，架构文档讲「为什么是这样」。

## 需要改动外壳本身时

[dshell-ui-architecture.md](dshell-ui-architecture.md) —— DSH 侧栏席位与网格几何的实测记录：`sidebar` 单席位接管要补哪些子席位、两列宽度为什么是 180 + 240、`props.width` 为什么不能反过来决定宽度、原生 `SidebarRoot` 的对齐值从哪来。改动布局前先读这份，可以省掉一轮试错。

## 截图

- [screenshots/README.md](screenshots/README.md) —— README 引用的图片规格与命名约定。

## 目录约定

| 位置 | 放什么 | 随包发布 |
|---|---|---|
| 根目录 | `README.md` / `README.en.md` / `CHANGELOG.md` / `CONTRIBUTING.md` / `SECURITY.md` / `LICENSE` | 是 |
| `docs/` | 接入方与贡献者文档 | 是 |
| `test/` | `node --test` 单测 | 否 |

开发期的校验脚本（`verify-css-literal.mjs`、`verify-declaration-order.mjs`、`smoke-render.mjs`、`audit-*.mjs`）在工作区里，不在本包内，也不在 `files[]` 里。其中前两个在 `npm run verify` 外单独运行，用来在改动样式模板或调整声明顺序后立刻发现结构问题。

**新增文档时**：接入方需要读的放本目录，并在上面「产品插件接入方」小节登记；只服务于本仓库开发的放 `CONTRIBUTING.md`。
