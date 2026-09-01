#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

function printHelp() {
  console.log(`x-post - Universal CLI for publishing to X (Twitter) via CDP

Usage:
  x-post [command] [options] [arguments]
  npx x-post [command] [options] [arguments]
  bunx x-post [command] [options] [arguments]

Commands:
  post [text]           Publish standard post (text + images + thread replies) [DEFAULT]
  video                 Publish video post with transcode monitoring
  quote <url>           Quote an existing tweet with custom commentary
  article <markdown>    Publish long-form Markdown article to X Articles
  translate <url>       Translate & republish foreign video tweets with burned subtitles

Examples:
  # Quick post
  x-post "Hello from universal CLI!" --image ./screenshot.png

  # Video post
  x-post video --video ./demo.mp4 "Feature Walkthrough" --submit

  # Quote tweet
  x-post quote https://x.com/user/status/1234567890 "Important insight!" --submit

  # X Article
  x-post article ./post.md --cover ./cover.png --submit

  # Video translation workflow
  x-post translate https://x.com/user/status/1234567890 --target-lang English

Options:
  --submit              Publish immediately (default: preview mode)
  --help, -h            Display this help message
  --version, -v         Display package version
`);
  process.exit(0);
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('x-post v1.0.0');
  process.exit(0);
}

let subcommand = args[0];
let scriptArgs = args.slice(1);
let targetScript = '';

switch (subcommand) {
  case 'post':
    targetScript = path.join(rootDir, 'scripts', 'x-browser.ts');
    break;
  case 'video':
    targetScript = path.join(rootDir, 'scripts', 'x-video.ts');
    break;
  case 'quote':
    targetScript = path.join(rootDir, 'scripts', 'x-quote.ts');
    break;
  case 'article':
    targetScript = path.join(rootDir, 'scripts', 'x-article.ts');
    break;
  case 'translate':
    targetScript = path.join(rootDir, 'scripts', 'x-translate-video.ts');
    break;
  default:
    // If first argument is not a known subcommand, treat as 'post'
    targetScript = path.join(rootDir, 'scripts', 'x-browser.ts');
    scriptArgs = args;
    break;
}

// Execute with bun
const checkBun = spawnSync('which', ['bun'], { stdio: 'pipe' });
const bunAvailable = checkBun.status === 0;

let result;
if (bunAvailable) {
  result = spawnSync('bun', [targetScript, ...scriptArgs], { stdio: 'inherit' });
} else {
  // If bun is not globally installed, attempt npx -y bun
  result = spawnSync('npx', ['-y', 'bun', targetScript, ...scriptArgs], { stdio: 'inherit' });
}

process.exit(result.status ?? 0);
