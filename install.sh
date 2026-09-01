#!/usr/bin/env bash
set -e

# ==============================================================================
# x-post Universal Agent Skill Installer
# Links or installs x-post across Claude Code, Gemini CLI, Codex, Cursor, etc.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_NAME="x-post"

echo "📦 Installing ${TARGET_NAME} across available AI agent environments..."

# 1. Claude Code (~/.claude/skills)
if [ -d "$HOME/.claude" ] || command -v claude >/dev/null 2>&1; then
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$HOME/.claude/skills/${TARGET_NAME}"
  cp -r "$SCRIPT_DIR" "$HOME/.claude/skills/${TARGET_NAME}"
  echo "  ✅ Installed for Claude Code -> $HOME/.claude/skills/${TARGET_NAME}"
fi

# 2. Antigravity & Gemini CLI (~/.gemini/config/skills)
if [ -d "$HOME/.gemini" ]; then
  mkdir -p "$HOME/.gemini/config/skills"
  rm -rf "$HOME/.gemini/config/skills/${TARGET_NAME}"
  cp -r "$SCRIPT_DIR" "$HOME/.gemini/config/skills/${TARGET_NAME}"
  echo "  ✅ Installed for Antigravity / Gemini CLI -> $HOME/.gemini/config/skills/${TARGET_NAME}"
fi

# 3. Codex & OpenCode (~/.codex/skills)
if [ -d "$HOME/.codex" ]; then
  mkdir -p "$HOME/.codex/skills"
  rm -rf "$HOME/.codex/skills/${TARGET_NAME}"
  cp -r "$SCRIPT_DIR" "$HOME/.codex/skills/${TARGET_NAME}"
  echo "  ✅ Installed for Codex / OpenCode -> $HOME/.codex/skills/${TARGET_NAME}"
fi

# 4. Global Agent Skills (~/.agents/skills)
mkdir -p "$HOME/.agents/skills"
rm -rf "$HOME/.agents/skills/${TARGET_NAME}"
cp -r "$SCRIPT_DIR" "$HOME/.agents/skills/${TARGET_NAME}"
echo "  ✅ Installed for Universal Agent Kernel -> $HOME/.agents/skills/${TARGET_NAME}"

echo ""
echo "🎉 Installation complete! You can now use x-post in any AI agent session or run via CLI:"
echo "   bun scripts/x-browser.ts \"Hello from x-post!\""
echo "   npx x-post --help"
