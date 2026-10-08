# 快速安装（从 zip 包开始）

这个包里就是 `@local/dsh-workbench` 插件的全部运行文件 —— **没有任何第三方依赖**，不需要联网、不需要 `pnpm add` 任何东西。

```
dsh-workbench/
  package.json        插件清单（dsh.bundle.patch + dsh.client）
  cordis.patch.yml    插入加载器的那一行
  client.js           全部界面（唯一需要关心的文件，约 6000 行）
  index.js            Host 半（保留的本地文件流式路由，当前客户端未调用）
  icon.svg
  locale/zh.json  locale/en.json
  README.md           完整功能文档
  INSTALL.md          安装细节与排错
  QUICKSTART.md       本文件
```

> `client.js` 只依赖 DSH **自带的**两个客户端包（`@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-session`），它们随 Web 版一起分发，**不需要单独安装**。

---

## 1. 解压到一个不会被删掉的位置

例如 `%USERPROFILE%\dsh-workbench`。

> ⚠️ **不要放临时目录**：profile 里存的是**绝对路径**，之后移动或删除这个文件夹，插件就加载失败了。

## 2. 查准目标机器真正在用的 profile（最关键的一步）

同一台机器上可能有 `desktop`、`web` 等多个 profile，而**桌面应用读的往往不是你最先看到的那个**。装错 profile 的表现是：**不报错，但插件安静地不出现。**

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'DeepSeek Harness.exe'" |
  Where-Object { $_.CommandLine -like '*dsh-desktop-host*' } |
  Select-Object -ExpandProperty CommandLine
```

输出形如 `... dsh-desktop-host\lib\index.js <dsh目录> <profile目录> ...` —— **第三个参数就是真正在用的 profile**。

## 3. 启用插件

编辑 `<profile目录>\package.json`，两处都要改：

```jsonc
{
  "dependencies": {
    "@local/dsh-workbench": "link:C:\\Users\\Administrator\\dsh-workbench"   // ← 你的真实路径
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@local/dsh-workbench"                                              // ← 这一项才是"已启用"开关
      ]
    }
  }
}
```

- `link:` 指向**包含 package.json 的那个目录**
- **`bundles` 里那一项不能少** —— 只加 `dependencies` 是不会加载的
- 反斜杠要写成 `\\`（JSON 转义）

然后在 profile 目录里建立链接：

```powershell
cd <profile目录>
pnpm install
```

## 4. 重启 DSH

**新增 / 删除 bundle 必须重启**（bundle 列表只在启动时读一次）。之后仅改 `client.js` 的话，`Ctrl+R` 刷新页面即可。

## 5. 验证

1. 左侧边栏出现 **工作台** 一行，其下方是各模块的状态点行
2. 点进「工作台」→ 首页应有模块卡片（**游戏开发控制台**、**框架笔记**）
3. 点任意卡片 → 控制台三栏：**对话节点树 / 对话轮次汇总 / 资源仓库**

## 6. 出问题怎么办

| 现象 | 原因 / 处理 |
| --- | --- |
| 插件完全不出现 | profile 装错了（回到第 2 步）；或 `bundles` 里漏了那一项；或忘了重启 |
| 整个客户端半崩了 | 从 `bundles` 里**删掉那一项**再重启即可恢复。插件里任何加载期错误都会让客户端半整体失败，所以**先禁用总是安全的** |
| 想升级 | 用新文件覆盖旧的 `client.js` 等，然后**刷新页面**（Host 半有改动才需要重启） |
| 模块/设置想重置 | 清掉 `localStorage` 里的 `dsh-workbench.v3`（禁用插件不会丢，重新启用会接着用） |

## 7. 更省事的做法

把 `dsh-workbench` 放进一个 **git 仓库**，在其它机器上直接用仓库地址安装，以后升级只要 `git pull`：

```
plugin_manager action=install_bundle target=git+https://…/dsh-workbench.git
```

也可以在目标机器的 HARNESS 里**直接粘这段话**（把路径换成真实路径）：

> 我有一个本地 DSH 插件在 `<路径>\dsh-workbench`（包名 `@local/dsh-workbench`）。
> 请用插件管理器把它作为 bundle 安装并启用（`install_bundle`，target 是这个目录路径），
> 装完确认它在 profile 的 `dsh.profile.bundles` 里，然后告诉我需要重启还是刷新页面。
