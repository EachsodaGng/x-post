# Quote Tweets Reference

The `x-quote.ts` script enables quoting any public tweet with your own added commentary while preserving original creator attribution.

## Workflow

1. **Target Normalization**: Normalizes `twitter.com` or `x.com` status URLs into standard format.
2. **Page Navigation**: Opens the target tweet in Chrome.
3. **Menu Interaction**: Clicks the retweet action icon (`[data-testid="retweet"]`) and selects the "Quote" dropdown item.
4. **Modal Compose**: Focuses the quote text area and inputs the commentary.
5. **Publish / Preview**: Submits via `--submit` or waits in preview mode.

## Command Reference

```bash
# Preview quote tweet
bun scripts/x-quote.ts https://x.com/karpathy/status/1758223000000000000 "Fascinating insights on LLM OS!"

# Publish quote tweet immediately
bun scripts/x-quote.ts https://x.com/sama/status/1758223000000000000 \
  "Great update for developers." \
  --submit
```

## CLI Parameters

| Parameter | Type | Description |
|---|---|---|
| `<tweet-url>` | Positional (Required) | Full URL of the tweet to quote |
| `<comment>` | Positional (Optional) | Commentary text to include |
| `--submit` | Flag | Publish post immediately (default: preview mode) |
| `--profile <dir>` | Option | Path to Chrome user data directory |
| `--help` | Flag | Display CLI options |

## Notes

- The tweet URL must be a valid public tweet (`https://x.com/<username>/status/<id>`).
- If you quote a tweet from a private/protected account, only authorized followers will be able to see the quoted content.
