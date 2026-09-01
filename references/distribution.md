# Universal Distribution & Agent Installation Guide

This guide details all distribution channels and installation methods for `x-post` across the modern AI agent ecosystem.

---

## 1. Claude Code & Claude Desktop (Anthropic Ecosystem)

### Option A: User-Level Global Installation (Recommended)
Installs the skill across all Claude Code workspaces for your user profile:
```bash
# Clone directly into Claude skills directory
git clone https://github.com/mamdouhaboammar/x-post.git ~/.claude/skills/x-post
```

### Option B: Project-Level Workspace Installation
Installs the skill locally for a single repository or team project:
```bash
# Inside your project root
mkdir -p .claude/skills
git clone https://github.com/mamdouhaboammar/x-post.git .claude/skills/x-post
```

### Option C: Packaged `.skill` Distribution
To bundle or install a single-file distributable artifact:
```bash
# Package skill into a portable .skill archive
python3 -m zipfile -c x-post.skill SKILL.md package.json marketplace.json bin references scripts

# Install by extracting to skills directory
unzip -o x-post.skill -d ~/.claude/skills/x-post
```

### Option D: Claude Marketplace / Plugin Registry
`x-post` includes a certified `marketplace.json` manifest conforming to the Claude Plugin schema:
```bash
# If using Claude plugin manager
claude plugin install x-post
```

---

## 2. Skills.sh (Vercel / Ecosystem Agent Skills Standard)

[Skills.sh](https://skills.sh) is the open-source skill registry and discovery hub for AI agents.

### Install via `skills` CLI:
```bash
# Add by GitHub repository URL
npx skills add https://github.com/mamdouhaboammar/x-post

# Or add by canonical name (once registered)
npx skills add x-post
```

### Zero-Install Instant Execution via `npx` / `bunx`:
Run any `x-post` command immediately without cloning:
```bash
# Post text + image
npx x-post "Hello from npx universal runner!" --image ./photo.png --submit

# Publish video
npx x-post video --video ./demo.mp4 "New Release Video" --submit

# Publish Markdown article
npx x-post article ./post.md --cover ./cover.png --submit

# Video translation workflow
npx x-post translate https://x.com/user/status/1234567890 --target-lang English
```

---

## 3. All Agents Universal Compatibility Matrix

| AI Agent / IDE | Configuration Path | Installation Command |
|---|---|---|
| **Claude Code** | `~/.claude/skills/x-post` | `git clone ... ~/.claude/skills/x-post` |
| **Antigravity / Gemini CLI** | `~/.gemini/config/skills/x-post` or `.agents/skills/x-post` | `git clone ... ~/.gemini/config/skills/x-post` |
| **Cursor** | `.cursor/skills/x-post` or `.cursor/rules/x-post.mdc` | `git clone ... .cursor/skills/x-post` |
| **Codex / OpenCode** | `~/.codex/skills/x-post` or `.agents/skills/x-post` | `git clone ... ~/.codex/skills/x-post` |
| **Windsurf** | `.windsurf/skills/x-post` or `.windsurfrules` | `git clone ... .windsurf/skills/x-post` |
| **Cline / Roo Code** | `.agents/skills/x-post` or Custom Instructions | `git clone ... .agents/skills/x-post` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Reference `SKILL.md` in instructions |

---

## 4. Automated Multi-Agent One-Line Installer (`install.sh`)

Run the following command to automatically detect installed agents on your machine and link `x-post` to all of them at once:

```bash
curl -fsSL https://raw.githubusercontent.com/mamdouhaboammar/x-post/main/install.sh | bash
```
