# 在另一台电脑的 DSH 上安装这个插件

> **最短路径**：本插件已在 GitHub 上，直接让 DSH 从仓库安装即可，不用拷文件夹：
> ```
> plugin_manager action=install_bundle target=git+https://github.com/512475656-dot/nraness-chajian.git
> ```
> 装完**重启 DSH**。下面是手动安装的完整说明（离线、内网或想改代码时用）。

这个插件是**本地插件**（包名 `@local/dsh-workbench`，未发布到任何 registry）。
所以手动安装时**不能靠包名安装** —— 必须先把文件夹拷过去，再让那边的 DSH 以"本地路径"的方式安装。

---

## 0. 前提

- 目标机器已装 DSH（版本 **不低于 0.2.0-rc.2**，`dsh-client-ui-layout` / `dsh-client-ui-session` 这两个客户端包要在，Web 版自带）。
- 目标机器上至少有**一个会话**（自检需要 `~/.dsh/sessions` 里有日志；没有也能装，只是自检跑不了）。
- 知道目标机器的 DSH **profile 目录**，Windows 下默认是 `%USERPROFILE%\.dsh\profiles\<profile名>`。
  > ⚠️ **别猜 profile 名**：同一台机器上可能同时存在 `desktop` 和 `web`（或更多），而**桌面应用读的往往不是你最先看到的那个**。
  > 查准的办法：看当前 DSH Host 进程的命令行，它把 profile 目录作为参数传进去了 ——
  > ```powershell
  > Get-CimInstance Win32_Process -Filter "Name = 'DeepSeek Harness.exe'" |
  >   Where-Object { $_.CommandLine -like '*dsh-desktop-host*' } |
  >   Select-Object -ExpandProperty CommandLine
  > ```
  > 输出里 `...\dsh-desktop-host\lib\index.js <dsh目录> <profile目录> ...` 的**第三个参数就是真正在用的 profile**。
  > 装到别的 profile 里**不会报错、也不会生效** —— 插件只是安静地不出现。

## 1. 把插件文件夹拷过去

需要**整个 `dsh-workbench` 目录**（这些是必需的）：

```
dsh-workbench/
  package.json          ← 插件清单：dsh.bundle.patch + dsh.client
  cordis.patch.yml      ← 插入加载器的那一行
  client.js             ← 全部界面（客户端半）
  index.js              ← Host 半（保留的本地文件流式路由，目前未被客户端调用）
  icon.svg
  locale/zh.json  locale/en.json
  README.md
  QUICKSTART.md         ← 从 zip 包开始的最短路径
  test/render-check.cjs ← 离线自检（可选，开发仓里才有，分发包为减小体积不含它）
```

> 分发包 `dsh-workbench-1.0.0.zip` 里**不含 `test/`**（约 600KB 的日志与样本，与运行无关）。想要离线自检就从开发仓拷 `test\render-check.cjs`。

放在哪都行，但**要放在不会随手删掉的位置**，例如：

- `%USERPROFILE%\dsh-workbench`
- 或者目标机器的工作区里，例如 `...\default-workspace\dsh-workbench`

> ⚠️ 不要放在临时目录：profile 里存的是**绝对路径**，以后移动/删除文件夹会让插件加载失败。

## 2. 让那台机器的 HARNESS 装上它（推荐）

在目标机器的 HARNESS 里**直接粘贴这段话**（把 `<路径>` 换成第 1 步的真实路径）：

> 我有一个本地 DSH 插件在 `<路径>\dsh-workbench`（包名 `@local/dsh-workbench`）。
> 请用插件管理器把它作为 bundle 安装并启用（`install_bundle`，target 是这个目录路径），
> 装完确认它在 profile 的 `dsh.profile.bundles` 里，然后告诉我需要重启还是刷新页面。

它会做的动作，本质就是下面两步（你不放心也可以自己手动做）：

1. 在 `~/.dsh/profiles/<profile>/package.json` 的 `dependencies` 里加：
   ```json
   "@local/dsh-workbench": "link:<路径>/dsh-workbench"
   ```
   （`file:` 也可以；`link:` 改代码即时生效，适合开发）
2. 在同一个文件的 `dsh.profile.bundles` 数组里加一项 `"@local/dsh-workbench"` —— **这一项才是"已启用"的开关**，少了它插件不会加载。

然后重启 DSH（Host 半变化必须重启；装完第一次建议直接重启一次）。

## 3. 手动路线（不用 HARNESS 代劳）

```powershell
# 1) 依赖 + 启用
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"     # profile 名按需改
$plugin  = "C:\path\to\dsh-workbench"                   # 第 1 步的路径
notepad "$profile\package.json"
#   dependencies 里加  "@local/dsh-workbench": "link:$plugin"
#   dsh.profile.bundles 里加 "@local/dsh-workbench"

# 2) 建立 node_modules 里的链接
cd $profile
pnpm install
```

## 4. 验证

1. 重启 DSH，然后**刷新页面**（`Ctrl+R`）。
2. 左侧边栏应出现 **工作台** 一行；点进去应看到模块卡片（游戏开发控制台 / 综合研究台）。
3. 点任意模块卡片 → 进入控制台 → 三栏：**对话节点树 / 对话轮次汇总 / 资源仓库**。

离线自检（不需要界面）：

```powershell
cd <路径>\dsh-workbench
node test/render-check.cjs
# 期望结尾：all render checks passed
# 没有会话日志时，可显式指定日志：
# node test/render-check.cjs C:\path\to\session.v4.jsonl.zstd
```

## 5. 启用 / 禁用 / 卸载

| 目的 | 做法 |
| --- | --- |
| 禁用 | 从 `dsh.profile.bundles` 里删掉 `"@local/dsh-workbench"`（保留 dependencies 也行） |
| 重新启用 | 再把它加回 `dsh.profile.bundles` |
| 卸载 | 上面两步 + 从 `dependencies` 删除 + `pnpm install`，最后删掉插件文件夹 |

> 出问题时**先禁用**（把 bundles 里那一项删掉）就能正常进入 DSH —— 插件里任何加载期错误都会让客户端半整体失败。
> 本地存储在 `localStorage` 的 `dsh-workbench.v3`（模块、桌面/界面设置、背景与流光参数、笔记），禁用后不会丢，重新启用会接着用。

## 6. 想一次性装多台 / 更省事？

本插件已发布在：**https://github.com/512475656-dot/nraness-chajian**

其它机器可以直接用仓库地址安装（不用手工拷文件夹）：

```
plugin_manager action=install_bundle target=git+https://github.com/512475656-dot/nraness-chajian.git
```

以后升级只要重新执行一次安装（或 `git pull`）—— 客户端半**刷新页面**即可生效，Host 半需要重启。
