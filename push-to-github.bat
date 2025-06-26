@echo off
chcp 65001
setlocal

echo.
echo =======================================================
echo ==      GitHub 首次推送向导 (One-Time Push)      ==
echo =======================================================
echo.

REM 检查 Git 是否已初始化
if exist .git (
    echo Git 仓库已存在，将继续执行...
) else (
    echo 未找到 .git 目录，正在初始化新的 Git 仓库...
    git init
)

REM 创建 .gitignore 文件，防止敏感信息和不必要的文件被提交
echo 正在创建 .gitignore 文件...
(
    echo # Node.js
    echo node_modules/
    echo dist/
    echo
    echo # IDE & OS
    echo .vscode/
    echo .idea/
    echo *.suo
    echo *.ntvs*
    echo *.njsproj
    echo *.sln
    echo
    echo # Build artifacts
    echo *.exe
    echo
    echo # 敏感信息和用户配置
    echo cookie.json
    echo config.json
) > .gitignore
echo .gitignore 文件创建成功！
echo.
echo 重要提示：cookie.json 和 config.json 已被忽略。
echo 这是为了保护您的账户安全和个人配置不被上传。
echo.

REM 让用户输入仓库 URL
set /p "repo_url=请输入你新建的 GitHub 仓库 URL 并按回车: "

if not defined repo_url (
    echo 错误：未输入 URL。程序将退出。
    goto end
)

echo.
echo 正在添加远程仓库...
REM 先尝试移除旧的 origin，以防万一
git remote remove origin >nul 2>&1
git remote add origin "%repo_url%"

echo 正在将所有文件添加到暂存区...
git add .

echo 正在创建首次提交...
git commit -m "feat: Initial project setup"

echo 正在设置主分支为 'main'...
git branch -M main

echo 正在将代码推送到 GitHub...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo ----------------------------------------------------
    echo 推送失败！请检查以下几点：
    echo 1. 你的 GitHub URL 是否正确？
    echo 2. 你是否有权限推送到该仓库？
    echo 3. 你的网络连接是否正常？
    echo 4. 是否已在本地配置好 Git 的用户名和凭据？
    echo ----------------------------------------------------
) else (
    echo.
    echo =======================================================
    echo ==         🎉 推送成功！代码已在 GitHub！         ==
    echo =======================================================
)

:end
pause