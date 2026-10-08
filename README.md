# 工作台 Workbench

> 一个 DSH Web GUI 客户端插件：把只有对话的界面，变成一个可以**管理多个项目、读懂一次开发、并把它总结成文档**的工作台。

[![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.0--rc.2-5aa9ff)](https://github.com/512475656-dot/nraness-chajian)
[![license](https://img.shields.io/badge/license-MIT-3ddc97)](#许可)
[![deps](https://img.shields.io/badge/dependencies-0-7c5cff)](#为什么是零依赖)

---

## 这是什么

装上之后，左侧边栏会多出 **工作台** 一行：

```
侧边栏
  ├─ 工作台            → 工作台面板（首页磁贴墙）
  └─ 每个模块一行       → 直接进入该模块（行首是灰/绿状态点）
        └─ 点模块卡片 → 对话控制台：三栏 + 自由增删窗格
        └─ 框架笔记   → 独立笔记本（不挂钩任何对话）
```

打开一个模块，中间栏是三栏控制台：

| 窗格 | 回答的问题 |
| --- | --- |
| **对话节点树** | 这次开发是怎么走的？—— 分支图 + 项目总览 + 轮次时间线 |
| **对话轮次汇总** | 这一轮到底做了什么？—— 输入 / 思考 / 回复 / 代码 / 参数 / 改动文件 |
| **资源仓库** | 还够用吗、花在哪了？—— 余额环 + 各项目消耗对比 + 逐轮占比 |

主要功能还包括：

- **总结导出**：把对话按主题压缩，用「**现象 → 根因 → 解法 → 结果**」模板生成**一页一主题的 PPT**（真表格，不是文本框摆的假表格）
- **框架笔记**：独立窗口，树状笔记 + 画布，支持**数位板压感笔**（笔宽随压力变化）与参考图
- **绑定 / 解除绑定**：控制台默认跟随当前对话，也可以显式钉死在某个会话上
- **液态玻璃**：正在运行的模块带克制的流光边缘（7 套配色）
- **界面可调**：10 种卡片排布、正方形/长方形比例、4 档毛玻璃材质、7 套流光配色

## 安装

> ⚠️ 这是一个**本地插件**（包名 `@local/dsh-workbench`，未发布到任何 npm registry）。安装 = 把文件放到本机、再告诉 DSH 启用它。

### 方式一：从本仓库安装（推荐）

```text
plugin_manager action=install_bundle target=git+https://github.com/512475656-dot/nraness-chajian.git
```

或者在目标机器的 HARNESS 里直接粘贴：

> 请用插件管理器把这个仓库作为 bundle 安装并启用：`git+https://github.com/512475656-dot/nraness-chajian.git`
> 装完确认它在 profile 的 `dsh.profile.bundles` 里，然后告诉我需要重启还是刷新页面。

### 方式二：下载 zip 手动安装

1. 下载本仓库（Code → Download ZIP）或 `git clone`
2. 解压/放到一个**不会被随手删掉**的位置（profile 里存的是**绝对路径**）
3. 编辑 `<profile目录>\package.json`，两处都要改：

```jsonc
{
  "dependencies": { "@local/dsh-workbench": "link:C:\\path\\to\\nraness-chajian" },
  "dsh": { "profile": { "bundles": [ /* … */ "@local/dsh-workbench" ] } }
}
```

4. 在 profile 目录执行 `pnpm install`，然后**重启 DSH**

> **最容易踩的坑**：同一台机器可能有 `desktop`、`web` 多个 profile，而桌面应用读的往往不是你最先看到的那个。装错了**不报错、插件也不出现**。查准的办法见 [QUICKSTART.md](QUICKSTART.md) 第 2 步。

### 启用后

- 新增/删除 bundle **必须重启 DSH**（bundle 列表只在启动时读一次）
- 之后只改 `client.js` 的话，**刷新页面**（`Ctrl+R`）即可
- 出问题先从 `dsh.profile.bundles` 里删掉那一项 —— **先禁用总是安全的**

## 为什么是零依赖

本插件只有一个文件在做事（`client.js`），它只引用 DSH **自带的**两个客户端包：

```
@deepseek-ai/dsh-client-ui-layout
@deepseek-ai/dsh-client-ui-session
```

所以**不需要联网、不需要 `pnpm add` 任何东西** —— 这也是它能整包拷走、或直接用 git 地址安装的原因。

它同样遵守几条底线：

- **不自己存会话数据**：读会话事件窗口与出厂 token 投影
- **不发模型请求**：所有摘要都是本地抽取式推导，原文永远可展开查看
- **不劫持宿主布局**：只用一个侧边栏槽位 + 一个主槽位

## 仓库结构

```
package.json        插件清单（dsh.bundle.patch + dsh.client）
cordis.patch.yml    插入加载器的那一行
client.js           全部界面（约 6000 行，唯一需要关心的文件）
index.js            Host 半（保留的本地文件流式路由，当前客户端未调用）
icon.svg
locale/zh.json  locale/en.json
README.md           完整功能文档与设计说明
INSTALL.md          安装细节与排错
QUICKSTART.md       从 zip 开始的最短路径
GIT.md              维护本仓库 / 推送到 GitHub 的说明
test/render-check.cjs   离线自检（83 项断言，可在无界面环境跑）
```

## 自检

```powershell
node test/render-check.cjs
# 期望结尾：all render checks passed   （83 项 PASS / 10 项 SKIP / 0 项 FAIL）
```

自检用一个有状态渲染器在**三个真实会话日志**（最大 8000+ 事件）上跑断言，覆盖：注册与槽位、10 种排布、卡片比例与大小、控制台预设与窗格、分支图、绑定语义、笔记增删与持久化、总结导出的 PPT 结构、以及**性能路径**（关键帧不许插值圆角、`filter` 动画不许挂回容器、自动翻页不许回来）。

## 已知边界（诚实说明）

- **真实帧率未测量**：性能修复是按根因逐条消除重绘/重栅格化并用断言锁住的，但没有 profiling 数据
- **Office 真实渲染未验证**：导出的 PPT 用 `python-pptx` 独立验证了结构（33 张真表格 / 392 单元格 / 0 个 `[object Object]`），但本机没有 Office/LibreOffice 的真实渲染对照
- **数位板压感曲线需要真机确认**：代码按 `event.pressure` 逐段插值笔宽，但没有真实数位板测试记录

## 许可

MIT（见 [LICENSE](LICENSE)）。若你希望换成别的许可，改 `LICENSE` 与上面这一行即可。

---

作者：[512475656-dot](https://github.com/512475656-dot)
