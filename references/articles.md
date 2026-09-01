# X Articles Reference (Long-Form Markdown)

Publish structured, rich-text Markdown documents directly to the **X Articles** editor with cover art and embedded inline images.

> [!NOTE]
> X Articles publishing requires an active **X Premium+** or **Verified Organizations** subscription.

## Markdown Document Schema

Articles can define metadata via YAML frontmatter:

```markdown
---
title: The Future of Agentic Software Engineering
cover_image: ./assets/hero-banner.png
---

# The Future of Agentic Software Engineering

Autonomous agents are transforming developer productivity by operating in continuous loops.

## Core Architectural Layers

Here is how modern agent loops function:

1. **Perception**: Reading workspace context, git history, and AST trees.
2. **Reasoning**: Planning multi-step tasks with strict acceptance criteria.
3. **Execution**: Modifying files, running tests, verifying gates.

![Agent Loop Diagram](./assets/diagram.png)

> "The true leverage of AI is not code generation, but verified loop convergence."

### Performance Benchmarks

- **Zero-shot success**: 42%
- **Self-correcting loop success**: 89%

```

## Markdown to X Articles Mapping

| Markdown Syntax | X Articles Editor Representation |
|---|---|
| `# Title` | Document title (top title field) |
| `## H2` - `###### H6` | Formatted `<h2>` section headers |
| `**bold**`, `*italic*` | `<strong>`, `<em>` rich text styles |
| `[link](https://...)` | Hyperlinks (`<a href>`) |
| `> Quote` | Rich blockquote element |
| ```` ```code``` ```` | Formatted blockquote (X editor limitation) |
| `- List item` | Bulleted unordered list |
| `1. Numbered item` | Numbered ordered list |
| `![Alt](./img.png)` | Automated placeholder replacement & native image upload |

## Command Reference

```bash
# Preview article draft in Chrome
bun scripts/x-article.ts ./article.md

# Override cover image and title
bun scripts/x-article.ts ./article.md \
  --title "Custom Title" \
  --cover ./custom-hero.png

# Publish article directly
bun scripts/x-article.ts ./article.md --submit

# Inspect intermediate JSON metadata & generated HTML
bun scripts/md-to-html.ts ./article.md --output json
```

## How Inline Images Work

1. `md-to-html.ts` extracts `![alt](path)` tags and inserts unique markers: `[[IMAGE_PLACEHOLDER_1]]`.
2. The HTML body is pasted into DraftEditor.
3. `x-article.ts` uses DOM TreeWalker to locate each placeholder text node.
4. It programmatically creates a selection Range over the placeholder, deletes it, and triggers a native image paste keystroke.
5. The image is uploaded and embedded into the exact document block position.
