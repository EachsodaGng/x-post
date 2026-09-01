# Runtime Setup & Pre-flight Requirements

Before executing any script in the `x-post` skill, verify that your local environment meets all required runtime and tool dependencies.

## Pre-flight Checklist

```bash
# 1. Verify Bun runtime
bun --version

# 2. Verify Google Chrome or Chromium executable
# Set X_BROWSER_CHROME_PATH if installed in a non-standard directory
echo "${X_BROWSER_CHROME_PATH:-Default path search enabled}"

# 3. For video translation workflow (optional, required only for x-translate-video.ts)
yt-dlp --version
ffmpeg -version
whisper-cli -h 2>/dev/null || whisper-cpp -h 2>/dev/null
```

## Dependency Installation Guide

### macOS
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install media tools (for video translation)
brew install yt-dlp ffmpeg whisper-cpp

# Ensure Google Chrome is installed
# /Applications/Google Chrome.app
```

### Linux (Debian / Ubuntu)
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install clipboard and media utilities
sudo apt-get update
sudo apt-get install -y google-chrome-stable wl-clipboard xclip ffmpeg

# Install yt-dlp
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Windows
```powershell
# Install Bun via PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"

# Install ffmpeg & yt-dlp via winget or chocolatey
winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `X_BROWSER_CHROME_PATH` | Path to Google Chrome or Chromium executable | System auto-discovery |
| `WHISPER_MODEL` | Path to Whisper ggml model binary | `~/.cache/whisper/ggml-base.bin` |
| `X_TRANSLATE_WORK_DIR` | Working directory for temporary video translation assets | `/tmp/x-translate` |
| `XDG_DATA_HOME` | Base directory for Chrome profile storage | `~/.local/share` |

## Authentication & Session Persistence

The skill launches a real Google Chrome instance with user profile isolation (`~/.local/share/x-browser-profile`).
- **First Run**: A Chrome window will open asking you to log into X (Twitter).
- **Subsequent Runs**: Cookies and session state remain persisted across all tool invocations.
