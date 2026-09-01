# Troubleshooting Guide

Diagnose and resolve common issues encountered when publishing to X via CDP.

## Error Directory

### 1. `Editor not found / Timed out waiting for X editor`
- **Root Cause**: The user is not logged in to X in the designated Chrome profile, or Cloudflare/2FA verification is blocking navigation.
- **Solution**:
  1. Run any script in preview mode (e.g. `bun scripts/x-browser.ts "Test"`).
  2. In the opened Chrome browser window, log into your X account.
  3. Once logged in, session cookies are preserved in `~/.local/share/x-browser-profile`. Future runs will bypass login.

### 2. `Chrome executable not found`
- **Root Cause**: Chrome is installed in a custom directory not in the default discovery path.
- **Solution**: Set the environment variable `X_BROWSER_CHROME_PATH`:
  ```bash
  export X_BROWSER_CHROME_PATH="/path/to/google-chrome"
  ```

### 3. `Failed to copy image to clipboard / Accessibility permission denied (macOS)`
- **Root Cause**: On macOS, sending keystrokes or accessing the pasteboard via `osascript` requires Accessibility permissions.
- **Solution**:
  1. Open **System Settings > Privacy & Security > Accessibility**.
  2. Ensure your Terminal emulator (e.g., Terminal, iTerm2, VS Code, Cursor) has permission enabled.

### 4. `Article editor not found`
- **Root Cause**: X Articles is a premium feature restricted to X Premium+ and Verified accounts.
- **Solution**: Verify that your account has an active X Premium subscription with article authoring permissions.

### 5. `whisper-cli / yt-dlp command not found`
- **Root Cause**: Media workflow utilities are not installed in system PATH.
- **Solution**:
  ```bash
  # macOS
  brew install yt-dlp ffmpeg whisper-cpp

  # Ubuntu / Debian
  sudo apt-get install ffmpeg
  # Install yt-dlp & whisper-cpp per runtime-setup.md
  ```

### 6. `Rate limit or automated action warning`
- **Root Cause**: Frequent repeated submissions in short intervals.
- **Solution**: Introduce natural delays between submissions and avoid rapid automated bursts.
