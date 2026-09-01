import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  CHROME_CANDIDATES_FULL,
  CdpConnection,
  findChromeExecutable,
  getDefaultProfileDir,
  getFreePort,
  sleep,
  waitForChromeDebugPort,
} from './x-utils.js';

const X_COMPOSE_URL = 'https://x.com/compose/post';

export interface XVideoOptions {
  text?: string;
  videoPath: string;
  submit?: boolean;
  timeoutMs?: number;
  profileDir?: string;
  chromePath?: string;
  /** Thread replies to add consecutively */
  reply?: string | string[];
}

export async function postVideoToX(options: XVideoOptions): Promise<void> {
  const { text, videoPath, submit = false, timeoutMs = 120_000, profileDir = getDefaultProfileDir(), reply } = options;

  const chromePath = options.chromePath ?? findChromeExecutable(CHROME_CANDIDATES_FULL);
  if (!chromePath) throw new Error('Chrome executable not found. Set X_BROWSER_CHROME_PATH environment variable.');

  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found at: ${videoPath}`);

  const absVideoPath = path.resolve(videoPath);
  console.log(`[x-video] Target Video: ${absVideoPath}`);

  await mkdir(profileDir, { recursive: true });

  const port = await getFreePort();
  console.log(`[x-video] Launching Chrome with profile: ${profileDir}`);

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
    X_COMPOSE_URL,
  ], { stdio: 'ignore' });

  let cdp: CdpConnection | null = null;

  try {
    const wsUrl = await waitForChromeDebugPort(port, 30_000, { includeLastError: true });
    cdp = await CdpConnection.connect(wsUrl, 30_000, { defaultTimeoutMs: 30_000 });

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    let pageTarget = targets.targetInfos.find((t) => t.type === 'page' && t.url.includes('x.com'));

    if (!pageTarget) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: X_COMPOSE_URL });
      pageTarget = { targetId, url: X_COMPOSE_URL, type: 'page' };
    }

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });
    await cdp.send('DOM.enable', {}, { sessionId });
    await cdp.send('Input.setIgnoreInputEvents', { ignore: false }, { sessionId });

    console.log('[x-video] Waiting for X compose editor to load...');
    await sleep(3000);

    const waitForEditor = async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = await cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', {
          expression: `!!document.querySelector('[data-testid="tweetTextarea_0"]')`,
          returnByValue: true,
        }, { sessionId });
        if (result.result.value) return true;
        await sleep(1000);
      }
      return false;
    };

    const editorFound = await waitForEditor();
    if (!editorFound) {
      console.log('[x-video] Editor not found. Please log in to X in the opened browser window.');
      console.log('[x-video] Waiting for login...');
      const loggedIn = await waitForEditor();
      if (!loggedIn) throw new Error('Timed out waiting for X editor. Please log in first.');
    }

    // Set video file via file input element
    console.log('[x-video] Selecting video file for upload...');
    const { root } = await cdp.send<{ root: { nodeId: number } }>('DOM.getDocument', {}, { sessionId });
    const { nodeId } = await cdp.send<{ nodeId: number }>('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[type="file"][accept*="video"], input[data-testid="fileInput"], input[type="file"]',
    }, { sessionId });

    if (!nodeId || nodeId === 0) {
      throw new Error('Could not locate file input element for video upload.');
    }

    await cdp.send('DOM.setFileInputFiles', {
      nodeId,
      files: [absVideoPath],
    }, { sessionId });
    console.log('[x-video] Video file attached, processing in background...');

    await sleep(2000);

    // Insert text while video is uploading
    if (text) {
      console.log('[x-video] Typing post text...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetTextarea_0"]')?.focus()`,
      }, { sessionId });
      await sleep(200);

      await cdp.send('Input.insertText', {
        text: text,
      }, { sessionId });
      await sleep(500);
    }

    // Wait for video upload and transcoding to complete
    console.log('[x-video] Waiting for video upload & transcoding to complete...');
    const waitForVideoReady = async (maxWaitMs = 180_000): Promise<boolean> => {
      const start = Date.now();
      let dots = 0;
      while (Date.now() - start < maxWaitMs) {
        const result = await cdp!.send<{ result: { value: { hasMedia: boolean; buttonEnabled: boolean } } }>('Runtime.evaluate', {
          expression: `(() => {
            const hasMedia = !!document.querySelector('[data-testid="attachments"] video, [data-testid="videoPlayer"], video');
            const tweetBtn = document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]');
            const buttonEnabled = tweetBtn && !tweetBtn.disabled && tweetBtn.getAttribute('aria-disabled') !== 'true';
            return { hasMedia, buttonEnabled };
          })()`,
          returnByValue: true,
        }, { sessionId });

        const { hasMedia, buttonEnabled } = result.result.value;
        if (hasMedia && buttonEnabled) {
          console.log('');
          return true;
        }

        process.stdout.write('.');
        dots++;
        if (dots % 60 === 0) console.log('');
        await sleep(2000);
      }
      console.log('');
      return false;
    };

    const videoReady = await waitForVideoReady();
    if (videoReady) {
      console.log('[x-video] Video processed and ready for publishing!');
    } else {
      console.log('[x-video] Video may still be processing. Check the browser window.');
    }

    // Handle thread replies
    const replies = Array.isArray(reply) ? reply : (reply ? [reply] : []);
    for (let rIdx = 0; rIdx < replies.length; rIdx++) {
      const replyText = replies[rIdx]!;
      console.log(`[x-video] Adding thread reply (${rIdx + 1}/${replies.length})...`);

      await cdp.send('Runtime.evaluate', {
        expression: `
          const addBtn = document.querySelector('[data-testid="addButton"]') ||
                        document.querySelector('[aria-label="Add post"]') ||
                        document.querySelector('[aria-label="添加帖子"]');
          if (addBtn) addBtn.click();
        `,
      }, { sessionId });
      await sleep(1000);

      const targetTextarea = `[data-testid="tweetTextarea_${rIdx + 1}"]`;
      await cdp.send('Runtime.evaluate', {
        expression: `
          const textarea = document.querySelector('${targetTextarea}');
          if (textarea) textarea.focus();
        `,
      }, { sessionId });
      await sleep(200);

      await cdp.send('Input.insertText', {
        text: replyText,
      }, { sessionId });
      await sleep(500);

      console.log(`[x-video] Thread reply ${rIdx + 1} added.`);
    }

    if (submit) {
      console.log('[x-video] Publishing video post...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]')?.click()`,
      }, { sessionId });
      await sleep(5000);
      console.log('[x-video] Video post submitted successfully!');
    } else {
      console.log('[x-video] Video post composed in preview mode. Add --submit to publish.');
      console.log('[x-video] Browser window remains open for your review.');
    }
  } finally {
    if (cdp) {
      cdp.close();
    }
    if (submit) {
      setTimeout(() => {
        if (!chrome.killed) try { chrome.kill('SIGKILL'); } catch {}
      }, 2_000).unref?.();
      try { chrome.kill('SIGTERM'); } catch {}
    }
  }
}

function printUsage(): never {
  console.log(`Publish video posts to X (Twitter) using real Chrome and CDP

Usage:
  bun scripts/x-video.ts --video <path> [options] [text]

Options:
  --video <path>   Video file path (required, supports MP4, MOV, WebM)
  --reply <text>   Append thread reply (repeatable for multiple thread tweets)
  --submit         Publish immediately (default: preview mode)
  --profile <dir>  Custom Chrome profile directory path
  --help           Show this help message

Examples:
  # Preview video post
  bun scripts/x-video.ts --video ./demo.mp4 "Check out our latest feature preview!"

  # Publish video with source link in thread
  bun scripts/x-video.ts --video ./clip.mp4 "Full interview breakdown" --reply "Original video: https://..." --submit
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let videoPath: string | undefined;
  let submit = false;
  let profileDir: string | undefined;
  const replies: string[] = [];
  const textParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--video' && args[i + 1]) {
      videoPath = args[++i]!;
    } else if (arg === '--reply' && args[i + 1]) {
      replies.push(args[++i]!);
    } else if (arg === '--submit') {
      submit = true;
    } else if (arg === '--profile' && args[i + 1]) {
      profileDir = args[++i];
    } else if (!arg.startsWith('-')) {
      textParts.push(arg);
    }
  }

  const text = textParts.join(' ').trim() || undefined;

  if (!videoPath) {
    console.error('Error: --video <path> argument is required.');
    printUsage();
  }

  await postVideoToX({ text, videoPath, submit, profileDir, reply: replies.length > 0 ? replies : undefined });
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
