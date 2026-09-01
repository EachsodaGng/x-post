import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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

function extractTweetUrl(urlOrId: string): string | null {
  if (urlOrId.match(/(?:x\.com|twitter\.com)\/\w+\/status\/\d+/)) {
    return urlOrId.replace(/twitter\.com/, 'x.com').split('?')[0];
  }
  return null;
}

export interface QuoteOptions {
  tweetUrl: string;
  comment?: string;
  submit?: boolean;
  timeoutMs?: number;
  profileDir?: string;
  chromePath?: string;
}

export async function quotePost(options: QuoteOptions): Promise<void> {
  const { tweetUrl, comment, submit = false, timeoutMs = 120_000, profileDir = getDefaultProfileDir() } = options;

  const chromePath = options.chromePath ?? findChromeExecutable(CHROME_CANDIDATES_FULL);
  if (!chromePath) throw new Error('Chrome executable not found. Set X_BROWSER_CHROME_PATH environment variable.');

  await mkdir(profileDir, { recursive: true });

  const port = await getFreePort();
  console.log(`[x-quote] Launching Chrome with profile: ${profileDir}`);
  console.log(`[x-quote] Navigating to target tweet: ${tweetUrl}`);

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
    tweetUrl,
  ], { stdio: 'ignore' });

  let cdp: CdpConnection | null = null;

  try {
    const wsUrl = await waitForChromeDebugPort(port, 30_000, { includeLastError: true });
    cdp = await CdpConnection.connect(wsUrl, 30_000, { defaultTimeoutMs: 15_000 });

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    let pageTarget = targets.targetInfos.find((t) => t.type === 'page' && t.url.includes('x.com'));

    if (!pageTarget) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: tweetUrl });
      pageTarget = { targetId, url: tweetUrl, type: 'page' };
    }

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });

    console.log('[x-quote] Waiting for tweet page to load...');
    await sleep(3000);

    const waitForRetweetButton = async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = await cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', {
          expression: `!!document.querySelector('[data-testid="retweet"]')`,
          returnByValue: true,
        }, { sessionId });
        if (result.result.value) return true;
        await sleep(1000);
      }
      return false;
    };

    const retweetFound = await waitForRetweetButton();
    if (!retweetFound) {
      console.log('[x-quote] Tweet or retweet button not found. Please log in to X in the browser window.');
      console.log('[x-quote] Waiting for login...');
      const loggedIn = await waitForRetweetButton();
      if (!loggedIn) throw new Error('Timed out waiting for tweet page. Please ensure you are logged in.');
    }

    // Click the retweet button
    console.log('[x-quote] Clicking retweet dropdown button...');
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="retweet"]')?.click()`,
    }, { sessionId });
    await sleep(1000);

    // Click Quote option from the menu
    console.log('[x-quote] Selecting Quote option...');
    const waitForQuoteOption = async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < 10_000) {
        const result = await cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', {
          expression: `!!document.querySelector('[data-testid="Dropdown"] [role="menuitem"]:nth-child(2)')`,
          returnByValue: true,
        }, { sessionId });
        if (result.result.value) return true;
        await sleep(200);
      }
      return false;
    };

    const quoteOptionFound = await waitForQuoteOption();
    if (!quoteOptionFound) {
      throw new Error('Quote option not found in the dropdown menu.');
    }

    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="Dropdown"] [role="menuitem"]:nth-child(2)')?.click()`,
    }, { sessionId });
    await sleep(2000);

    // Wait for the quote compose dialog
    console.log('[x-quote] Waiting for quote dialog...');
    const waitForQuoteDialog = async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < 10_000) {
        const result = await cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', {
          expression: `!!document.querySelector('[data-testid="tweetTextarea_0"]')`,
          returnByValue: true,
        }, { sessionId });
        if (result.result.value) return true;
        await sleep(200);
      }
      return false;
    };

    const dialogFound = await waitForQuoteDialog();
    if (!dialogFound) {
      throw new Error('Quote compose dialog did not open.');
    }

    if (comment) {
      console.log('[x-quote] Inserting commentary...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetTextarea_0"]')?.focus()`,
      }, { sessionId });
      await sleep(200);

      await cdp.send('Input.insertText', {
        text: comment,
      }, { sessionId });
      await sleep(500);
    }

    if (submit) {
      console.log('[x-quote] Publishing quote post...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]')?.click()`,
      }, { sessionId });
      await sleep(2000);
      console.log('[x-quote] Quote post published successfully!');
    } else {
      console.log('[x-quote] Quote post composed in preview mode. Add --submit to publish.');
      console.log('[x-quote] Browser window will stay open for 30 seconds for review...');
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
  console.log(`Quote a tweet on X (Twitter) with commentary using real Chrome and CDP

Usage:
  bun scripts/x-quote.ts <tweet-url> [options] [comment]

Options:
  --submit         Publish immediately (default: preview mode)
  --profile <dir>  Custom Chrome profile directory path
  --help           Show this help message

Examples:
  # Preview a quote tweet
  bun scripts/x-quote.ts https://x.com/user/status/123456789 "Incredible breakthrough in multi-agent systems!"

  # Publish quote tweet immediately
  bun scripts/x-quote.ts https://x.com/user/status/123456789 "Strongly agree with this perspective." --submit
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let tweetUrl: string | undefined;
  let submit = false;
  let profileDir: string | undefined;
  const commentParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--submit') {
      submit = true;
    } else if (arg === '--profile' && args[i + 1]) {
      profileDir = args[++i];
    } else if (!arg.startsWith('-')) {
      if (!tweetUrl && arg.match(/(?:x\.com|twitter\.com)\/\w+\/status\/\d+/)) {
        tweetUrl = extractTweetUrl(arg) ?? undefined;
      } else {
        commentParts.push(arg);
      }
    }
  }

  if (!tweetUrl) {
    console.error('Error: Please provide a valid tweet URL.');
    console.error('Example: bun scripts/x-quote.ts https://x.com/username/status/123456789 "My comment"');
    process.exit(1);
  }

  const comment = commentParts.join(' ').trim() || undefined;

  await quotePost({ tweetUrl, comment, submit, profileDir });
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
