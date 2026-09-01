# Video Posts Reference

The `x-video.ts` script handles uploading and publishing video content to X with automated transcode monitoring and thread reply integration.

## Video Upload Workflow

1. **Browser Initialization**: Chrome launches with isolated CDP session.
2. **Direct File Input Dispatch**: Video file path is passed directly to the DOM input node via `DOM.setFileInputFiles`.
3. **Concurrent Text Insertion**: While the video binary is uploading to X servers, post text is inserted via `Input.insertText`.
4. **Transcode Monitoring Loop**: Script periodically polls DOM attachment status (`[data-testid="attachments"] video`) and tweet button disabled state until X finishes transcoding.
5. **Thread Replying**: If `--reply` is specified, consecutive thread tweets are appended.
6. **Publication / Preview**: Posts with `--submit` or stays open for manual confirmation.

## Command Reference

```bash
# Preview video post
bun scripts/x-video.ts --video ./demo.mp4 "Check out this feature walkthrough!"

# Publish video with thread reply linking documentation
bun scripts/x-video.ts --video ./presentation.mp4 \
  "Autonomous Agent Orchestration Breakdown" \
  --reply "Full source code and documentation: https://github.com/org/repo" \
  --submit
```

## CLI Parameters

| Flag | Type | Description |
|---|---|---|
| `--video <path>` | Option (Required) | Path to video file (MP4, MOV, WebM) |
| `<text>` | Positional | Text copy for the video post |
| `--reply <text>` | Option | Text for second tweet in thread (repeatable) |
| `--submit` | Flag | Publish post immediately (default: preview mode) |
| `--profile <dir>` | Option | Path to Chrome user data directory |
| `--help` | Flag | Display CLI options |

## Technical Limits

- **Duration Limits**:
  - Standard (Free) Accounts: Max 140 seconds (2 mins 20 secs). Max file size: 512 MB.
  - X Premium Accounts: Up to 1080p, 60 minutes or 3 hours (depending on tier). Max file size: 8 GB.
- **Supported Formats**: MP4 (H.264 video codec, AAC audio codec), MOV, WebM.
- **Processing Times**: Usually 15-60 seconds depending on video length and server load.
