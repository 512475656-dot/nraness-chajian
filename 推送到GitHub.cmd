@echo off
chcp 65001 >nul
title Push workbench to GitHub
cd /d "%~dp0"

echo ============================================================
echo   DSH 工作台插件 - 推送到 GitHub
echo   仓库: https://github.com/512475656-dot/nraness-chajian
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [X] 没有找到 git。
  echo     请先安装 Git for Windows: https://git-scm.com/download/win
  echo     装好后重新双击本文件即可。
  goto end
)

echo [1/3] 检查提交状态...
git log --oneline -1
echo.

echo [2/3] 正在推送（首次会弹出 GitHub 登录窗口，按提示登录即可）...
git push -u origin main
if not errorlevel 1 goto ok

echo.
echo [!] 直接推送被拒绝（远端已有历史，这很正常）。
echo     改为把远端历史和本地合并后再推...
git fetch origin
git merge --allow-unrelated-histories --no-edit origin/main
git push -u origin main
if errorlevel 1 goto fail

:ok
echo.
echo ============================================================
echo   [OK] 推送成功，可以去 GitHub 上看这个仓库了。
echo ============================================================
goto end

:fail
echo.
echo ============================================================
echo   [X] 推送失败。请把上面的文字整段截图发给我。
echo ============================================================

:end
echo.
pause
