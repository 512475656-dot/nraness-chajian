# 维护这个仓库

## 首次推送（本机已建好，只需认证一次）

仓库已在 `C:\Users\Administrator\dsh-repo` 初始化好，并且已经有了第一次提交。你要做的只有**推送**：

```powershell
cd C:\Users\Administrator\dsh-repo
git push -u origin main
```

推送时会要求认证。GitHub 从 2021 年起**不再接受账号密码**，请用 **PAT（个人访问令牌）**：

1. 打开 <https://github.com/settings/tokens> → **Generate new token (classic)**
2. 勾选 **`repo`**（公开仓库其实只需要 `public_repo`，勾 `repo` 更省事）
3. 有效期按需选，生成后**立刻复制**（只显示一次）
4. 回到命令行：
   - **用户名**填 `512475656-dot`
   - **密码**位置**粘贴那个令牌**（不是账号密码）

> 用 HTTPS 推送时，令牌会被 Windows 凭据管理器记住，之后不用再输。

## 之后更新代码

```powershell
cd C:\Users\Administrator\dsh-repo
# 从开发目录同步最新文件（client.js 是唯一经常变的）
Copy-Item C:\Users\Administrator\dsh-workbench\client.js . -Force
Copy-Item C:\Users\Administrator\dsh-workbench\README.md, C:\Users\Administrator\dsh-workbench\INSTALL.md, C:\Users\Administrator\dsh-workbench\QUICKSTART.md . -Force
git add -A
git commit -m "更新 client.js"
git push
```

想更省事可以用一个脚本（本仓库不含，属可选）：

```powershell
# 把开发目录的文件同步过来再提交
$src = 'C:\Users\Administrator\dsh-workbench'
$dst = 'C:\Users\Administrator\dsh-repo'
'client.js','index.js','package.json','cordis.patch.yml','icon.svg' | ForEach-Object {
    Copy-Item (Join-Path $src $_) (Join-Path $dst $_) -Force
}
Copy-Item (Join-Path $src 'locale\*.json') (Join-Path $dst 'locale') -Force
cd $dst; git add -A; git commit -m "sync from dev"; git push
```

> ⚠️ 这个仓库根目录的 `README.md` 是**面向 GitHub 访客**写的（含徽章与安装指引）；
> 开发目录里的 `README.md` 是**功能与设计文档**，篇幅大得多。两者内容不同，别互相覆盖弄混 ——
> 上面第 2 步把开发目录的 README 拷过来会覆盖仓库版，**如果你要保持 GitHub 首页的样式，就别拷 `README.md`**。

## 别人怎么安装这个仓库

```
plugin_manager action=install_bundle target=git+https://github.com/512475656-dot/nraness-chajian.git
```

装完**重启 DSH**；之后改客户端的更新只需 `git pull` + 刷新页面。

## 备注

- 本仓库根目录就是插件目录，所以 `git+https://…` 可以直接装 —— **不要把插件挪进子目录**，否则安装路径要跟着改。
- `test/out/`（自检生成的样本 PPT）已在 `.gitignore` 里，属可再生产物。
- `node_modules/` 与 `pnpm-lock.yaml` 不进仓库：本插件零第三方依赖。
