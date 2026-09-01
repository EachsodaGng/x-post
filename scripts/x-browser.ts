import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import {
  CHROME_CANDIDATES_FULL,
  CdpConnection,
  copyImageToClipboard,
  findChromeExecutable,
  getDefaultProfileDir,
  getFreePort,
  pasteFromClipboard,
  sleep,
  waitForChromeDebugPort,
} from './x-utils.js';

const X_COMPOSE_URL = 'https://x.com/compose/post';

export interface XBrowserOptions {
  text?: string;
  images?: string[];
  submit?: boolean;
  timeoutMs?: number;
  profileDir?: string;
  chromePath?: string;
  /** Thread replies to add consecutively */
  reply?: string | string[];
}

export async function postToX(options: XBrowserOptions): Promise<void> {
  const { text, images = [], submit = false, timeoutMs = 120_000, profileDir = getDefaultProfileDir(), reply } = options;

  const chromePath = options.chromePath ?? findChromeExecutable(CHROME_CANDIDATES_FULL);
  if (!chromePath) throw new Error('Chrome executable not found. Set X_BROWSER_CHROME_PATH environment variable.');

  await mkdir(profileDir, { recursive: true });

  const port = await getFreePort();
  console.log(`[x-browser] Launching Chrome with profile at: ${profileDir}`);

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
    cdp = await CdpConnection.connect(wsUrl, 30_000, { defaultTimeoutMs: 15_000 });

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    let pageTarget = targets.targetInfos.find((t) => t.type === 'page' && t.url.includes('x.com'));

    if (!pageTarget) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: X_COMPOSE_URL });
      pageTarget = { targetId, url: X_COMPOSE_URL, type: 'page' };
    }

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });
    await cdp.send('Input.setIgnoreInputEvents', { ignore: false }, { sessionId });

    console.log('[x-browser] Waiting for X post editor to initialize...');
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
      console.log('[x-browser] Editor not detected. Please log in to X in the opened browser window.');
      console.log('[x-browser] Waiting for user login...');
      const loggedIn = await waitForEditor();
      if (!loggedIn) throw new Error('Timed out waiting for X editor. Please log in first.');
    }

    if (text) {
      console.log('[x-browser] Inserting post text...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetTextarea_0"]')?.focus()`,
      }, { sessionId });
      await sleep(200);

      // Insert text reliably using CDP Input.insertText
      await cdp.send('Input.insertText', {
        text: text,
      }, { sessionId });
      await sleep(500);
    }

    for (const imagePath of images) {
      if (!fs.existsSync(imagePath)) {
        console.warn(`[x-browser] Warning: Image file not found: ${imagePath}`);
        continue;
      }

      console.log(`[x-browser] Preparing image upload: ${imagePath}`);

      if (!copyImageToClipboard(imagePath)) {
        console.warn(`[x-browser] Failed to copy image to system clipboard: ${imagePath}`);
        continue;
      }

      await sleep(500);

      // Focus post editor
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetTextarea_0"]')?.focus()`,
      }, { sessionId });
      await sleep(200);

      // Trigger system hardware paste
      console.log('[x-browser] Pasting image via system keystroke...');
      const pasteSuccess = pasteFromClipboard('Google Chrome', 5, 500);

      if (!pasteSuccess) {
        console.log('[x-browser] System paste command failed, falling back to CDP event...');
        const modifiers = process.platform === 'darwin' ? 4 : 2;
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'v',
          code: 'KeyV',
          modifiers,
          windowsVirtualKeyCode: 86,
        }, { sessionId });
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'v',
          code: 'KeyV',
          modifiers,
          windowsVirtualKeyCode: 86,
        }, { sessionId });
      }

      console.log('[x-browser] Waiting for image processing & upload...');
      await sleep(4000);
    }

    // Handle thread replies
    const replies = Array.isArray(reply) ? reply : (reply ? [reply] : []);
    for (let rIdx = 0; rIdx < replies.length; rIdx++) {
      const replyText = replies[rIdx]!;
      console.log(`[x-browser] Adding thread reply (${rIdx + 1}/${replies.length})...`);

      // Click the Add post button (+)
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

      console.log(`[x-browser] Thread reply ${rIdx + 1} added.`);
    }

    if (submit) {
      console.log('[x-browser] Publishing post to X...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]')?.click()`,
      }, { sessionId });
      await sleep(3000);
      console.log('[x-browser] Post published successfully!');
    } else {
      console.log('[x-browser] Post composed in preview mode. Pass --submit to publish.');
      console.log('[x-browser] Browser window will remain open for 30 seconds for review...');
      await sleep(30_000);
    }
  } finally {
    if (cdp) {
      try { await cdp.send('Browser.close', {}, { timeoutMs: 5_000 }); } catch {}
      cdp.close();
    }

    setTimeout(() => {
      if (!chrome.killed) try { chrome.kill('SIGKILL'); } catch {}
    }, 2_000).unref?.();
    try { chrome.kill('SIGTERM'); } catch {}
  }
}

function printUsage(): never {
  console.log(`Publish text and image posts to X (Twitter) using real Chrome and CDP

Usage:
  bun scripts/x-browser.ts [options] [text]

Options:
  --image <path>   Attach image file (PNG/JPG/GIF/WebP, max 4, repeatable)
  --reply <text>   Append a thread reply (repeatable for multiple thread tweets)
  --submit         Publish immediately (default: preview mode)
  --profile <dir>  Custom Chrome profile directory path
  --help           Show this help message

Examples:
  # Preview text post
  bun scripts/x-browser.ts "Launching our new product today!"

  # Post with image and thread reply
  bun scripts/x-browser.ts "Big announcement!" --image ./hero.png --reply "Read the full spec: https://example.com" --submit
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  const images: string[] = [];
  const replies: string[] = [];
  let submit = false;
  let profileDir: string | undefined;
  const textParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--image' && args[i + 1]) {
      images.push(args[++i]!);
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

  if (!text && images.length === 0) {
    console.error('Error: Please provide post text or at least one image.');
    process.exit(1);
  }

  await postToX({ text, images, submit, profileDir, reply: replies.length > 0 ? replies : undefined });
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
