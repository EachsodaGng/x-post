# Regular Posts Reference (Text, Images & Threads)

The `x-browser.ts` script enables automated posting of standard X updates with support for text, up to 4 images, and multi-tweet thread chaining.

## Architecture & CDP Execution

Automated posting tools often fail due to bot detection (Cloudflare, Arkose Labs, CDP synthetic event rejection). This skill uses real Chrome automation:
1. **Real Browser Instance**: Launches Google Chrome directly with `--disable-blink-features=AutomationControlled`.
2. **CDP Connection**: Communicates over WebSocket via Chrome DevTools Protocol.
3. **Hardware Keystrokes for Media**: Image uploads are placed on the system clipboard (`copy-to-clipboard.ts`) and pasted via native OS events (`osascript` on macOS, `xdotool`/`ydotool` on Linux, PowerShell on Windows) to prevent synthetic drag-and-drop detection.
4. **Input.insertText**: Text is inserted using CDP's native UTF-8 text insertion, which supports emojis and multi-line formatting without character truncation.

## Command Reference

```bash
# Preview text post (window stays open for 30s)
bun scripts/x-browser.ts "Exploring agentic workflows with Antigravity!"

# Attach up to 4 images
bun scripts/x-browser.ts "System Architecture & Flow" \
  --image ./diagram-1.png \
  --image ./diagram-2.png \
  --image ./diagram-3.png

# Create a multi-tweet thread
bun scripts/x-browser.ts "1/2 Deep dive into agent skills:" \
  --image ./cover.png \
  --reply "2/2 Find full implementation details on our docs repo!" \
  --submit

# Use a custom Chrome profile
bun scripts/x-browser.ts "Testing custom profile" --profile ~/.x-custom-profile --submit
```

## CLI Parameters

| Flag | Type | Description |
|---|---|---|
| `<text>` | Positional | Main post copy (string) |
| `--image <path>` | Option | Image path (PNG, JPG, GIF, WebP, max 4, repeatable) |
| `--reply <text>` | Option | Thread reply content (clicks `+` to add sequential tweet) |
| `--submit` | Flag | Publish post immediately (default: preview mode) |
| `--profile <dir>` | Option | Path to Chrome user data directory |
| `--help` | Flag | Display CLI options |

## Best Practices & Limits

- **Character Limits**: Free accounts: 280 characters per tweet. Premium accounts: up to 25,000 characters.
- **Image Specifications**: Up to 4 images per tweet. Max file size: 5MB for images, 15MB for GIFs.
- **Preview First**: Run without `--submit` first to visually inspect layout in Chrome.
