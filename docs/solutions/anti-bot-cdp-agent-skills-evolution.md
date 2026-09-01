---
title: Universal Anti-Bot Agent Skills Evolution, CDP Toolchains & Multi-Agent Distribution
category: agent-skills-and-automation
date: 2026-09-01
tags: [agent-skill, cdp, chrome-automation, anti-bot-bypass, skill-conductor, universal-distribution, mermaid-syntax, bun]
problem: >
  Standard browser automation tools (Playwright/Puppeteer) are detected and blocked by modern social platforms (Cloudflare/Arkose Labs/X bot detection), while raw skills often undertrigger, leak process in descriptions, lack universal agent distribution, and break in GitHub Markdown rendering.
root_cause: >
  1) Automation detection triggers on `navigator.webdriver` and synthetic CDP clipboard events.
  2) Agent skills fail validation when description contains workflow steps, lacks pushy/negative triggers, or exceeds token budgets.
  3) GitHub Mermaid parser fails with 'Unable to render rich display' when node labels contain unquoted special characters (`--`, `/`, `&`, `+`, `~`, `.`, `=`).
solution: >
  1) Use Real Chrome instances with CDP + OS-level hardware keystrokes (Swift/PowerShell/xclip + osascript).
  2) Evolve skills via Skill Conductor (MOC structure <500 lines, canonical description formula, 10/10 eval_skill gate).
  3) Quote all Mermaid node and edge labels in README.md.
  4) Bundle universal multi-agent distribution (Claude Code, Claude Marketplace, npx/Skills.sh, Cursor, Codex, Gemini CLI).
---

# Universal Anti-Bot Agent Skills Evolution, CDP Toolchains & Multi-Agent Distribution

## 1. Executive Summary & Overview

This learning captures the end-to-end blueprint for building, evolving, validating, and distributing production-grade AI agent skills that require anti-bot web automation (e.g. social platforms like X / Twitter, LinkedIn, etc.) while maintaining 100% universal compatibility across all AI agent harnesses.

---

## 2. Core Architectural Discoveries

### A. Anti-Bot Web Automation Bypass (Real Chrome CDP + Hardware Keystrokes)
- **The Failure**: Headless browser automation (Puppeteer, Playwright, Selenium) trips frontend bot detection (`navigator.webdriver = true`) and synthetic clipboard paste events (`Input.dispatchKeyEvent` or JavaScript `ClipboardEvent`) are silently ignored by rich text editors (DraftEditor, Lexical, ProseMirror).
- **The Solution**:
  1. Launch real Google Chrome via `--disable-blink-features=AutomationControlled` with a persistent user data directory (`~/.local/share/<skill>-profile`).
  2. Connect via Chrome DevTools Protocol (CDP) WebSocket for DOM navigation, page state detection, and `Input.insertText` (which preserves UTF-8, line breaks, and emojis).
  3. For file/media attachments and rich HTML, write data directly to the native OS pasteboard (using Swift/AppKit on macOS, PowerShell on Windows, `xclip`/`wl-copy` on Linux) and dispatch real OS hardware-level keystrokes (`Cmd+V` via `osascript`, `Ctrl+V` via `xdotool`/PowerShell).

### B. Skill Conductor Canon (The 10 Authoring Principles)
When creating or evolving agent skills, adhere strictly to the Skill Conductor canon to avoid undertriggering or context bloat:
1. **Canonical Description Formula**:
   ```
   [What it does] + Use when [4-5 natural phrasing variations] + "even if they don't explicitly say '<canonical term>'" + Do NOT use for [negatives]
   ```
2. **No Workflow in Description**: Never write `first... then... step 1...` in the YAML description; agents will follow the description and skip the SKILL.md body.
3. **Map of Content (MOC)**: Keep `SKILL.md` under 500 lines as a high-altitude navigation map; detailed operational guides, schemas, and troubleshooting belong in `references/*.md`.
4. **Pre-flight Checks**: Point to `references/runtime-setup.md` at the start of `SKILL.md` to verify dependencies before mutating state.
5. **Validation Gate**: Run `eval_skill.py <skill-path>` to verify 10/10 score across Structure, Discovery, Frontmatter, and Body length.

---

## 3. GitHub Markdown & Mermaid Parsing Invariants

### The Problem
GitHub's web Markdown renderer frequently errors with `Unable to render rich display` on Mermaid diagram blocks.

### The Root Cause
Mermaid's syntax parser on GitHub fails when:
- Node labels contain unquoted punctuation: `--`, `/`, `&`, `+`, `~`, `.`, `=`.
- Subgraph identifiers contain spaces or ampersands (e.g. `subgraph Media & Clipboard Pipeline`).
- Edge labels contain unquoted special characters (e.g. `-->|macOS: Swift / Win: PowerShell|`).

### The Invariant Rule
1. **Always quote node labels**: `A["Agent Command"] --> B["x-post Engine"]`
2. **Always quote edge texts**: `C -->|"Flag"| D["--disable-blink-features=AutomationControlled"]`
3. **Use alphanumeric subgraph IDs with quoted titles**: `subgraph MediaPipeline ["Media & Clipboard Pipeline"]`

---

## 4. Universal Multi-Agent Distribution Blueprint

To make an agent skill accessible to the entire AI ecosystem:

| Target Channel | Manifest / Configuration | Mechanism |
|---|---|---|
| **Claude Code** | `SKILL.md` in `~/.claude/skills/<name>` | Direct folder or `.skill` zip bundle |
| **Claude Marketplace** | `marketplace.json` conforming to Claude Plugin schema | `claude plugin install <name>` |
| **Skills.sh (Vercel)** | `.skills.json` at repository root | `npx skills add <repo-url>` |
| **Instant CLI Execution** | `"bin": { "<name>": "./bin/<name>.js" }` in `package.json` | `npx <name> <command>` / `bunx <name> <command>` |
| **Antigravity / Gemini CLI** | `~/.gemini/config/skills/<name>` | Native skill activation |
| **Cursor / Codex / OpenCode** | `.agents/skills/<name>` or `.cursor/skills/` | Universal directory linking |
| **One-Line Installer** | `install.sh` shell script | Links skill across all detected agent folders |

---

## 5. Verification Checklist for Future Skill Authoring

- [ ] `SKILL.md` frontmatter has trigger variations, pushy clause, and negative triggers.
- [ ] No process or workflow steps in frontmatter description.
- [ ] Body length < 500 lines with table-of-contents navigation to `references/`.
- [ ] All scripts tested with Bun and provide informative `--help` outputs.
- [ ] All Mermaid diagrams in `README.md` use strict quoted string syntax.
- [ ] `eval_skill.py` score = 10/10.
- [ ] Packaged `.skill` archive verified.
