import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { parseMarkdown } from './md-to-html.js';
import {
  CHROME_CANDIDATES_FULL,
  CdpConnection,
  copyHtmlToClipboard,
  copyImageToClipboard,
  findChromeExecutable,
  getDefaultProfileDir,
  getFreePort,
  pasteFromClipboard,
  sleep,
  waitForChromeDebugPort,
} from './x-utils.js';

const X_ARTICLES_URL = 'https://x.com/compose/articles';

const I18N_SELECTORS = {
  titleInput: [
    'textarea[placeholder="Add a title"]',
    'textarea[placeholder="添加标题"]',
    'textarea[placeholder="タイトルを追加"]',
    'textarea[placeholder="제목 추가"]',
    'textarea[name="Article Title"]',
  ],
  addPhotosButton: [
    '[aria-label="Add photos or video"]',
    '[aria-label="添加照片或视频"]',
    '[aria-label="写真や動画を追加"]',
    '[aria-label="사진 또는 동영상 추가"]',
  ],
  previewButton: [
    'a[href*="/preview"]',
    '[data-testid="previewButton"]',
    'button[aria-label*="preview" i]',
    'button[aria-label*="预览" i]',
    'button[aria-label*="プレビュー" i]',
    'button[aria-label*="미리보기" i]',
  ],
  publishButton: [
    '[data-testid="publishButton"]',
    'button[aria-label*="publish" i]',
    'button[aria-label*="发布" i]',
    'button[aria-label*="公開" i]',
    'button[aria-label*="게시" i]',
  ],
};

export interface ArticleOptions {
  markdownPath: string;
  coverImage?: string;
  title?: string;
  submit?: boolean;
  profileDir?: string;
  chromePath?: string;
}

export async function publishArticle(options: ArticleOptions): Promise<void> {
  const { markdownPath, submit = false, profileDir = getDefaultProfileDir() } = options;

  console.log('[x-article] Parsing markdown document...');
  const parsed = await parseMarkdown(markdownPath, {
    title: options.title,
    coverImage: options.coverImage,
  });

  console.log(`[x-article] Article Title: ${parsed.title}`);
  console.log(`[x-article] Cover Image: ${parsed.coverImage ?? 'none'}`);
  console.log(`[x-article] Content Images: ${parsed.contentImages.length}`);

  const htmlPath = path.join(os.tmpdir(), 'x-article-content.html');
  await writeFile(htmlPath, parsed.html, 'utf-8');
  console.log(`[x-article] Processed HTML saved to: ${htmlPath}`);

  const chromePath = options.chromePath ?? findChromeExecutable(CHROME_CANDIDATES_FULL);
  if (!chromePath) throw new Error('Chrome executable not found. Set X_BROWSER_CHROME_PATH environment variable.');

  await mkdir(profileDir, { recursive: true });
  const port = await getFreePort();

  console.log(`[x-article] Launching Chrome with profile: ${profileDir}`);
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
    X_ARTICLES_URL,
  ], { stdio: 'ignore' });

  let cdp: CdpConnection | null = null;

  try {
    const wsUrl = await waitForChromeDebugPort(port, 30_000, { includeLastError: true });
    cdp = await CdpConnection.connect(wsUrl, 30_000, { defaultTimeoutMs: 30_000 });

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    let pageTarget = targets.targetInfos.find((t) => t.type === 'page' && t.url.includes('x.com'));

    if (!pageTarget) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: X_ARTICLES_URL });
      pageTarget = { targetId, url: X_ARTICLES_URL, type: 'page' };
    }

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });
    await cdp.send('DOM.enable', {}, { sessionId });

    console.log('[x-article] Waiting for X Articles interface to load...');
    await sleep(3000);

    const waitForElement = async (selector: string, timeoutMs = 60_000): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = await cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', {
          expression: `!!document.querySelector('${selector}')`,
          returnByValue: true,
        }, { sessionId });
        if (result.result.value) return true;
        await sleep(500);
      }
      return false;
    };

    // Check if on article dashboard with Write button
    console.log('[x-article] Checking for Write/Create button on dashboard...');
    const writeButtonFound = await waitForElement('[data-testid="empty_state_button_text"]', 10_000);

    if (writeButtonFound) {
      console.log('[x-article] Clicking Write button...');
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="empty_state_button_text"]')?.click()`,
      }, { sessionId });
      await sleep(2000);
    }

    // Wait for title editor textarea
    const titleSelectors = I18N_SELECTORS.titleInput.join(', ');
    console.log('[x-article] Waiting for article editor to become ready...');
    const editorFound = await waitForElement(titleSelectors, 30_000);
    if (!editorFound) {
      console.log('[x-article] Article editor not found. Note: X Articles requires an active X Premium subscription.');
      await sleep(30_000);
      throw new Error('Article editor not found. Please verify X Premium access and login state.');
    }

    // Upload cover image if present
    if (parsed.coverImage) {
      console.log('[x-article] Uploading cover image...');

      const addPhotosSelectors = JSON.stringify(I18N_SELECTORS.addPhotosButton);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const selectors = ${addPhotosSelectors};
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { el.click(); return true; }
          }
          return false;
        })()`,
      }, { sessionId });
      await sleep(500);

      const { root } = await cdp.send<{ root: { nodeId: number } }>('DOM.getDocument', {}, { sessionId });
      const { nodeId } = await cdp.send<{ nodeId: number }>('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '[data-testid="fileInput"], input[type="file"][accept*="image"]',
      }, { sessionId });

      if (nodeId) {
        await cdp.send('DOM.setFileInputFiles', {
          nodeId,
          files: [parsed.coverImage],
        }, { sessionId });
        console.log('[x-article] Cover image file selected.');

        console.log('[x-article] Waiting for Apply button...');
        const applyFound = await waitForElement('[data-testid="applyButton"]', 15_000);
        if (applyFound) {
          await cdp.send('Runtime.evaluate', {
            expression: `document.querySelector('[data-testid="applyButton"]')?.click()`,
          }, { sessionId });
          console.log('[x-article] Cover image applied.');
          await sleep(1000);
        }
      }
    }

    // Fill title
    if (parsed.title) {
      console.log('[x-article] Inserting article title...');
      const titleInputSelectors = JSON.stringify(I18N_SELECTORS.titleInput);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const selectors = ${titleInputSelectors};
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { el.focus(); return true; }
          }
          return false;
        })()`,
      }, { sessionId });
      await sleep(200);

      await cdp.send('Input.insertText', { text: parsed.title }, { sessionId });
      await sleep(300);

      // Trigger save by tabbing out
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, { sessionId });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, { sessionId });
      await sleep(500);
    }

    // Insert HTML into DraftEditor body
    console.log('[x-article] Inserting body content...');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
        if (editor) {
          editor.focus();
          editor.click();
          return true;
        }
        return false;
      })()`,
    }, { sessionId });
    await sleep(300);

    // Attempt insertion via DataTransfer paste event
    await cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
      expression: `(() => {
        const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
        if (!editor) return false;

        const html = ${JSON.stringify(htmlContent)};
        const dt = new DataTransfer();
        dt.setData('text/html', html);
        dt.setData('text/plain', html.replace(/<[^>]*>/g, ''));

        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });

        editor.dispatchEvent(pasteEvent);
        return true;
      })()`,
      returnByValue: true,
    }, { sessionId });

    await sleep(1000);

    const contentCheck = await cdp.send<{ result: { value: number } }>('Runtime.evaluate', {
      expression: `document.querySelector('.DraftEditor-editorContainer [data-contents="true"]')?.innerText?.length || 0`,
      returnByValue: true,
    }, { sessionId });

    if (contentCheck.result.value > 50) {
      console.log(`[x-article] Content inserted successfully (${contentCheck.result.value} chars).`);
    } else {
      console.log('[x-article] Paste event fallback: attempting execCommand insertHTML...');
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
          if (!editor) return false;
          editor.focus();
          document.execCommand('insertHTML', false, ${JSON.stringify(htmlContent)});
          return true;
        })()`,
      }, { sessionId });

      await sleep(1000);

      const check2 = await cdp.send<{ result: { value: number } }>('Runtime.evaluate', {
        expression: `document.querySelector('.DraftEditor-editorContainer [data-contents="true"]')?.innerText?.length || 0`,
        returnByValue: true,
      }, { sessionId });

      if (check2.result.value > 50) {
        console.log(`[x-article] Content inserted via execCommand (${check2.result.value} chars).`);
      } else {
        console.log('[x-article] Auto-insert failed. Copying HTML to clipboard for manual paste...');
        copyHtmlToClipboard(htmlPath);
        pasteFromClipboard('Google Chrome', 5, 500);
      }
    }

    // Insert content images sequentially replacing placeholders
    if (parsed.contentImages.length > 0) {
      console.log(`[x-article] Inserting ${parsed.contentImages.length} inline content images...`);

      const sortedImages = [...parsed.contentImages].sort((a, b) => a.blockIndex - b.blockIndex);

      for (let i = 0; i < sortedImages.length; i++) {
        const img = sortedImages[i]!;
        console.log(`[x-article] [${i + 1}/${sortedImages.length}] Processing placeholder: ${img.placeholder}`);

        const selectPlaceholder = async (maxRetries = 3): Promise<boolean> => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            await cdp!.send('Runtime.evaluate', {
              expression: `(() => {
                const editor = document.querySelector('.DraftEditor-editorContainer [data-contents="true"]');
                if (!editor) return false;

                const placeholder = ${JSON.stringify(img.placeholder)};
                const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
                let node;

                while ((node = walker.nextNode())) {
                  const text = node.textContent || '';
                  const idx = text.indexOf(placeholder);
                  if (idx !== -1) {
                    const parentElement = node.parentElement;
                    if (parentElement) {
                      parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    const range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + placeholder.length);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return true;
                  }
                }
                return false;
              })()`,
            }, { sessionId });

            await sleep(800);

            const selectionCheck = await cdp!.send<{ result: { value: string } }>('Runtime.evaluate', {
              expression: `window.getSelection()?.toString() || ''`,
              returnByValue: true,
            }, { sessionId });

            const selectedText = selectionCheck.result.value.trim();
            if (selectedText === img.placeholder) {
              return true;
            }

            if (attempt < maxRetries) {
              await sleep(500);
            }
          }
          return false;
        };

        const selected = await selectPlaceholder(3);
        if (!selected) {
          console.warn(`[x-article] Could not select placeholder ${img.placeholder}, skipping.`);
          continue;
        }

        if (!copyImageToClipboard(img.localPath)) {
          console.warn(`[x-article] Failed to copy image ${img.localPath} to clipboard.`);
          continue;
        }

        await sleep(1000);

        // Delete placeholder
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId });
        await sleep(500);

        // Focus editor
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
            if (editor) editor.focus();
          })()`,
        }, { sessionId });
        await sleep(300);

        // Paste image via hardware keystroke
        console.log(`[x-article] Pasting image: ${path.basename(img.localPath)}`);
        pasteFromClipboard('Google Chrome', 5, 1000);

        await sleep(5000);
      }

      console.log('[x-article] All inline images processed.');
    }

    // Trigger save by blurring editor
    console.log('[x-article] Triggering article autosave...');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const editor = document.querySelector('.DraftEditor-editorContainer [contenteditable="true"]');
        if (editor) editor.blur();
        document.body.click();
      })()`,
    }, { sessionId });
    await sleep(1500);

    // Click Preview
    console.log('[x-article] Opening article preview...');
    const previewSelectors = JSON.stringify(I18N_SELECTORS.previewButton);
    await cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
      expression: `(() => {
        const selectors = ${previewSelectors};
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return true; }
        }
        return false;
      })()`,
      returnByValue: true,
    }, { sessionId });
    await sleep(3000);

    if (submit) {
      console.log('[x-article] Publishing article...');
      const publishSelectors = JSON.stringify(I18N_SELECTORS.publishButton);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const selectors = ${publishSelectors};
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && !el.disabled) { el.click(); return true; }
          }
          return false;
        })()`,
      }, { sessionId });
      await sleep(3000);
      console.log('[x-article] Article published successfully!');
    } else {
      console.log('[x-article] Article created in draft/preview mode.');
      console.log('[x-article] Browser will remain open for manual verification.');
    }
  } finally {
    if (cdp) {
      cdp.close();
    }
  }
}

function printUsage(): never {
  console.log(`Publish Markdown long-form articles to X Articles (requires X Premium)

Usage:
  bun scripts/x-article.ts <markdown_file> [options]

Options:
  --title <title>     Override article title
  --cover <image>     Override cover image path
  --submit            Publish immediately (default: draft preview mode)
  --profile <dir>     Custom Chrome profile directory path
  --help              Show this help message

Markdown Frontmatter:
  ---
  title: In-Depth Engineering Analysis
  cover_image: /path/to/hero.png
  ---

Examples:
  # Compose article draft and preview
  bun scripts/x-article.ts ./article.md --cover ./cover.png

  # Publish article directly
  bun scripts/x-article.ts ./article.md --submit
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  let markdownPath: string | undefined;
  let title: string | undefined;
  let coverImage: string | undefined;
  let submit = false;
  let profileDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (arg === '--cover' && args[i + 1]) {
      coverImage = args[++i];
    } else if (arg === '--submit') {
      submit = true;
    } else if (arg === '--profile' && args[i + 1]) {
      profileDir = args[++i];
    } else if (!arg.startsWith('-')) {
      markdownPath = arg;
    }
  }

  if (!markdownPath) {
    console.error('Error: Markdown file path is required.');
    process.exit(1);
  }

  if (!fs.existsSync(markdownPath)) {
    console.error(`Error: Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }

  await publishArticle({ markdownPath, title, coverImage, submit, profileDir });
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
