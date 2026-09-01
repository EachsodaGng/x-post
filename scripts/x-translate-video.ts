import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

// ============ Configuration ============
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(os.homedir(), '.cache/whisper/ggml-base.bin');
const WORK_DIR = process.env.X_TRANSLATE_WORK_DIR || path.join(os.tmpdir(), 'x-translate');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function runCommand(cmd: string, description: string): string {
  console.log(`[x-translate] ${description}...`);
  try {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err: any) {
    throw new Error(`${description} failed: ${err.message}`);
  }
}

function extractTweetId(url: string): string {
  const match = url.match(/status\/(\d+)/);
  if (!match) throw new Error('Invalid X / Twitter URL format.');
  return match[1]!;
}

// ============ Step 1: Fetch Tweet Metadata ============

async function fetchTweetMetadata(url: string): Promise<{ text: string; author: string }> {
  console.log('[x-translate] Fetching original tweet metadata...');
  try {
    const output = runCommand(
      `yt-dlp --cookies-from-browser chrome --dump-json "${url}" 2>/dev/null`,
      'Retrieving tweet details via yt-dlp'
    );
    const info = JSON.parse(output);
    return {
      text: info.description || '',
      author: info.uploader || info.channel || 'unknown',
    };
  } catch {
    console.log('[x-translate] Could not automatically extract tweet description text. Manual translation required.');
    return { text: '', author: '' };
  }
}

// ============ Step 2: Download Video ============

function downloadVideo(url: string, outputPath: string): void {
  runCommand(
    `yt-dlp --cookies-from-browser chrome -o "${outputPath}" "${url}"`,
    'Downloading video asset'
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error('Video download failed.');
  }

  const stats = fs.statSync(outputPath);
  console.log(`[x-translate] Video downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

// ============ Step 3: Extract & Transcribe Subtitles ============

function extractSubtitles(videoPath: string, outputSrt: string): string {
  const audioPath = videoPath.replace(/\.[^.]+$/, '.wav');
  runCommand(
    `ffmpeg -i "${videoPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${audioPath}" -y 2>/dev/null`,
    'Extracting audio track for transcription'
  );

  console.log('[x-translate] Transcribing audio track using Whisper...');
  let whisperOutput = '';
  try {
    whisperOutput = runCommand(
      `whisper-cli -m "${WHISPER_MODEL}" -f "${audioPath}" --output-srt -of "${outputSrt.replace('.srt', '')}" 2>&1`,
      'Whisper transcription'
    );
  } catch (err: any) {
    console.warn(`[x-translate] whisper-cli note: ${err.message}`);
  }

  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  if (fs.existsSync(outputSrt)) {
    return fs.readFileSync(outputSrt, 'utf-8');
  }

  return whisperOutput;
}

// ============ Step 4: Generate Translation Document ============

interface TranslationData {
  originalUrl: string;
  originalText: string;
  originalSubtitles: string;
  translatedText: string;
  translatedSubtitles: string;
  videoPath: string;
  outputVideoPath: string;
  targetLang: string;
}

function generateTranslationFile(data: TranslationData, outputPath: string): void {
  const content = `# X Video Translation Workflow - Ready for Review

## Original Tweet URL
${data.originalUrl}

## Target Language
${data.targetLang}

## Original Post Text
${data.originalText || '(No text content extracted)'}

## Translated Post Text (Review & Edit)
${data.translatedText}

## Original Subtitles (SRT)
\`\`\`srt
${data.originalSubtitles || '1\n00:00:00,000 --> 00:00:05,000\n(Transcription placeholder)'}
\`\`\`

## Translated Subtitles (Review & Edit - Maintain Valid SRT Format)
\`\`\`srt
${data.translatedSubtitles}
\`\`\`

---
Video Source Path: ${data.videoPath}
Synthesized Output Video: ${data.outputVideoPath}

When ready, run:
bun scripts/x-translate-video.ts --confirm "${outputPath}" [--submit]
`;

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`[x-translate] Translation document created: ${outputPath}`);
}

// ============ Step 5: Burn Subtitles into Video ============

function composeVideoWithSubtitles(videoPath: string, srtPath: string, outputPath: string): void {
  // Use escaped path for ffmpeg subtitles filter
  const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  runCommand(
    `ffmpeg -i "${videoPath}" -vf "subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,MarginV=25'" -c:a copy "${outputPath}" -y 2>/dev/null`,
    'Burning translated subtitles into output video'
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error('Video composition and subtitle burning failed.');
  }

  const stats = fs.statSync(outputPath);
  console.log(`[x-translate] Subtitled video rendered: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

// ============ Step 6: Publish Video Post ============

async function publishPost(
  text: string,
  videoPath: string,
  originalUrl: string,
  submit: boolean
): Promise<void> {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const xVideoScript = path.join(scriptDir, 'x-video.ts');

  const args = [
    'run',
    xVideoScript,
    '--video',
    videoPath,
    '--reply',
    `Original post: ${originalUrl}`,
    text,
  ];

  if (submit) {
    args.push('--submit');
  }

  console.log('[x-translate] Delegating post submission to x-video.ts...');
  const child = spawn('bun', args, {
    stdio: 'inherit',
    cwd: scriptDir,
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        console.log('\n[x-translate] Video post workflow completed successfully!');
        resolve();
      } else {
        reject(new Error(`x-video.ts exited with code: ${code}`));
      }
    });
  });
}

// ============ Parse Translation File ============

function parseTranslationFile(filePath: string): {
  originalUrl: string;
  translatedText: string;
  translatedSubtitles: string;
  videoPath: string;
  outputVideoPath: string;
} {
  const content = fs.readFileSync(filePath, 'utf-8');

  const urlMatch = content.match(/## Original Tweet URL\n(.+)/i);
  const textMatch = content.match(/## Translated Post Text \(Review & Edit\)\n([\s\S]*?)(?=\n## Original Subtitles)/i);
  const subMatch = content.match(/## Translated Subtitles[\s\S]*?```srt\n([\s\S]*?)```/i);
  const videoMatch = content.match(/Video Source Path: (.+)/i);
  const outputMatch = content.match(/Synthesized Output Video: (.+)/i);

  if (!urlMatch || !textMatch || !subMatch || !videoMatch || !outputMatch) {
    throw new Error('Invalid translation document format. Please check required sections and headers.');
  }

  return {
    originalUrl: urlMatch[1]!.trim(),
    translatedText: textMatch[1]!.trim(),
    translatedSubtitles: subMatch[1]!.trim(),
    videoPath: videoMatch[1]!.trim(),
    outputVideoPath: outputMatch[1]!.trim(),
  };
}

// ============ Main Handlers ============

async function processNewUrl(url: string, targetLang = 'English'): Promise<void> {
  const tweetId = extractTweetId(url);
  const workDir = path.join(WORK_DIR, tweetId);
  ensureDir(workDir);

  const videoPath = path.join(workDir, 'original.mp4');
  const srtPath = path.join(workDir, 'original.srt');
  const translationFile = path.join(workDir, 'translation.md');
  const outputVideoPath = path.join(workDir, 'output_translated.mp4');

  // 1. Fetch metadata
  const { text: originalText } = await fetchTweetMetadata(url);

  // 2. Download video
  downloadVideo(url, videoPath);

  // 3. Extract & Transcribe Subtitles
  let originalSubtitles = '';
  try {
    originalSubtitles = extractSubtitles(videoPath, srtPath);
  } catch (err) {
    console.warn('[x-translate] Subtitle extraction warning: manual subtitle generation may be required.');
  }

  // 4. Generate translation draft file
  generateTranslationFile({
    originalUrl: url,
    originalText,
    originalSubtitles,
    translatedText: '[Insert translated post copy here]',
    translatedSubtitles: originalSubtitles || '1\n00:00:00,000 --> 00:00:05,000\n[Insert translated subtitles here]',
    videoPath,
    outputVideoPath,
    targetLang,
  }, translationFile);

  console.log('\n========================================');
  console.log('Next Steps:');
  console.log(`1. Review / edit translation document: ${translationFile}`);
  console.log('2. Provide the translated post copy and SRT subtitles.');
  console.log(`3. Run synthesis & preview: bun scripts/x-translate-video.ts --confirm "${translationFile}"`);
  console.log(`4. Run synthesis & publish: bun scripts/x-translate-video.ts --confirm "${translationFile}" --submit`);
  console.log('========================================\n');
}

async function confirmAndPublish(translationFile: string, submit: boolean): Promise<void> {
  if (!fs.existsSync(translationFile)) {
    throw new Error(`Translation file not found: ${translationFile}`);
  }

  const data = parseTranslationFile(translationFile);
  const workDir = path.dirname(translationFile);
  const srtPath = path.join(workDir, 'translated.srt');

  fs.writeFileSync(srtPath, data.translatedSubtitles, 'utf-8');

  composeVideoWithSubtitles(data.videoPath, srtPath, data.outputVideoPath);

  await publishPost(data.translatedText, data.outputVideoPath, data.originalUrl, submit);
}

function printUsage(): never {
  console.log(`Translate and republish video posts on X with burned subtitles and source attribution

Usage:
  # Step 1: Ingest tweet URL (download video, transcribe audio, create translation draft)
  bun scripts/x-translate-video.ts <tweet-url> [--target-lang <language>]

  # Step 2: Edit / fill the generated translation.md file

  # Step 3: Burn subtitles and preview
  bun scripts/x-translate-video.ts --confirm <path/to/translation.md>

  # Step 4: Burn subtitles and publish
  bun scripts/x-translate-video.ts --confirm <path/to/translation.md> --submit

Options:
  --confirm <file>       Path to translation.md to synthesize subtitles and proceed
  --target-lang <lang>   Target language for translation (default: English)
  --submit               Publish immediately (default: preview mode)
  --help                 Show this help message

Environment Variables:
  WHISPER_MODEL          Path to Whisper model binary (default: ~/.cache/whisper/ggml-base.bin)
  X_TRANSLATE_WORK_DIR   Directory for temporary media artifacts (default: /tmp/x-translate)
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
  }

  const submit = args.includes('--submit');
  const confirmIndex = args.indexOf('--confirm');

  let targetLang = 'English';
  const langIndex = args.indexOf('--target-lang');
  if (langIndex !== -1 && args[langIndex + 1]) {
    targetLang = args[langIndex + 1]!;
  }

  if (confirmIndex !== -1) {
    const translationFile = args[confirmIndex + 1];
    if (!translationFile) {
      throw new Error('Please specify the path to translation.md after --confirm.');
    }
    await confirmAndPublish(translationFile, submit);
  } else {
    const url = args.find((a) => a.startsWith('http'));
    if (!url) {
      throw new Error('Please provide a valid tweet URL.');
    }
    await processNewUrl(url, targetLang);
  }
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error(`[x-translate] Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
