#!/bin/zsh
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  node server.js
  exit $?
fi

if [ -x "/Users/wangkeyu/Desktop/Codex.app/Contents/Resources/node" ]; then
  "/Users/wangkeyu/Desktop/Codex.app/Contents/Resources/node" server.js
  exit $?
fi

if [ -x "/Applications/Codex.app/Contents/Resources/node" ]; then
  "/Applications/Codex.app/Contents/Resources/node" server.js
  exit $?
fi

echo "没有找到 Node.js。"
echo "请安装 Node.js: https://nodejs.org/"
echo ""
echo "安装后再双击 start.command，或在终端运行："
echo "node server.js"
read "?按回车关闭窗口..."
