'use strict';
// Video-scout SDK path: analyze a PUBLIC YouTube video by passing its URL straight to the Gemini
// API (v1beta generateContent, REST via node's built-in fetch — no npm deps). This route exists
// because the gemini CLI's @file attachment is inline-base64 with a hard 20MB cap
// (MAX_FILE_SIZE_MB in the CLI bundle), which every real 720p video exceeds; the CLI then
// silently sends the prompt WITHOUT the video. The API's fileData.fileUri accepts a public
// YouTube URL directly: no yt-dlp download, no size cap, and generationConfig.mediaResolution
// actually takes effect here (the CLI has no flag for it).
//
// Invoked by scripts/feed-gemini.ps1 when Resolve-VideoSourceRoute picks 'sdk' (YouTube URL +
// video mode). Non-YouTube / local files still go through the CLI path unchanged.
//
// Auth: GEMINI_API_KEY from the environment ONLY (video-scout PTYs receive it from safeStorage
// via main.js's ptyEnv). Never accepted on argv (argv is visible in process listings), never
// read from or written to disk.
//
// Args:
//   --url <youtube url>              required
//   --model <gemini model>           default gemini-2.5-flash-lite
//   --media-resolution LOW|MEDIUM|HIGH   default MEDIUM (maps to MEDIA_RESOLUTION_*)
//   --prompt-file <path>             read prompt from file (newlines preserved — no CLI
//                                    flattening needed on this path)
//   --prompt-text <text>             literal prompt (overrides --prompt-file)
//   --start-offset <seconds>         optional; with --end-offset, analyzes only that slice —
//   --end-offset <seconds>           billing scales to the slice (~81% cheaper for 2min of 10min)
//
// Output: analysis text to stdout, then one machine-readable usage line the renderer forwards
// to the Logs tab:  [video-scout usage] prompt=N (video=N audio=N text=N) output=N total=N ...

const fs = require('fs');

const MEDIA_RESOLUTION_MAP = {
  LOW: 'MEDIA_RESOLUTION_LOW',
  MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
  HIGH: 'MEDIA_RESOLUTION_HIGH',
};
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--media-resolution') out.mediaResolution = argv[++i];
    else if (a === '--prompt-file') out.promptFile = argv[++i];
    else if (a === '--prompt-text') out.promptText = argv[++i];
    else if (a === '--start-offset') out.startOffset = argv[++i];
    else if (a === '--end-offset') out.endOffset = argv[++i];
  }
  return out;
}

// Pure request-body builder, exported for tests. Offsets are plumbed through NOW (per the
// migration spec) even though the modal doesn't offer a range picker yet — when both are given
// they become videoMetadata on the same part as fileData, which is what makes the API bill only
// the slice instead of the whole video.
function buildRequestBody({ url, prompt, mediaResolution, startOffset, endOffset }) {
  const videoPart = { fileData: { fileUri: url } };
  if (startOffset !== undefined && endOffset !== undefined) {
    videoPart.videoMetadata = { startOffset: `${startOffset}s`, endOffset: `${endOffset}s` };
  }
  const body = { contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }] };
  const mapped = MEDIA_RESOLUTION_MAP[mediaResolution];
  if (mapped) body.generationConfig = { mediaResolution: mapped };
  return body;
}

function formatUsageLine(usage, model, mediaResolution, sliced) {
  const byModality = {};
  for (const d of usage.promptTokensDetails || []) byModality[d.modality] = d.tokenCount;
  return `[video-scout usage] prompt=${usage.promptTokenCount ?? '?'} ` +
    `(video=${byModality.VIDEO ?? 0} audio=${byModality.AUDIO ?? 0} text=${byModality.TEXT ?? 0}) ` +
    `output=${usage.candidatesTokenCount ?? '?'} total=${usage.totalTokenCount ?? '?'} ` +
    `model=${model} mediaRes=${mediaResolution}${sliced ? ' sliced=yes' : ''}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('[video-scout sdk] GEMINI_API_KEY is not set in the environment. Launch video-scout from the app (which injects it from safeStorage), or set it for this session.');
    process.exit(1);
  }
  if (!args.url) { console.error('[video-scout sdk] --url is required.'); process.exit(1); }

  let prompt = args.promptText;
  if (!prompt && args.promptFile) prompt = fs.readFileSync(args.promptFile, 'utf8').trim();
  if (!prompt) { console.error('[video-scout sdk] no prompt: pass --prompt-file or --prompt-text.'); process.exit(1); }

  const model = args.model || DEFAULT_MODEL;
  const mediaResolution = MEDIA_RESOLUTION_MAP[args.mediaResolution] ? args.mediaResolution : 'MEDIUM';
  const sliced = args.startOffset !== undefined && args.endOffset !== undefined;

  const body = buildRequestBody({
    url: args.url, prompt, mediaResolution,
    startOffset: sliced ? args.startOffset : undefined,
    endOffset: sliced ? args.endOffset : undefined,
  });

  console.log(`[video-scout sdk] analyzing ${args.url}`);
  console.log(`[video-scout sdk] model=${model} mediaResolution=${mediaResolution} (ENFORCED on this path)${sliced ? ` slice=${args.startOffset}s-${args.endOffset}s` : ' (whole video)'}`);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const t0 = Date.now();
  let res, json;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    json = await res.json();
  } catch (err) {
    console.error(`[video-scout sdk] network error: ${err.message}`);
    process.exit(1);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (!res.ok) {
    // Visible failure, always: status + the API's own error message (503 = transient demand,
    // 400 on fileUri = video not public/available, 429 = rate/quota).
    const apiMsg = json && json.error ? `${json.error.status || ''} ${json.error.message || ''}`.trim() : JSON.stringify(json).slice(0, 500);
    console.error(`[video-scout sdk] HTTP ${res.status} after ${secs}s: ${apiMsg}`);
    process.exit(1);
  }

  const finish = json.candidates && json.candidates[0] && json.candidates[0].finishReason;
  const text = ((json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [])
    .map((p) => p.text || '').join('');
  if (!text) {
    console.error(`[video-scout sdk] empty response (finishReason=${finish}). Full candidate: ${JSON.stringify(json.candidates || json).slice(0, 800)}`);
    process.exit(1);
  }

  console.log(`\n${text}\n`);
  if (finish !== 'STOP') console.error(`[video-scout sdk] WARNING: finishReason=${finish} — output may be truncated.`);
  console.log(formatUsageLine(json.usageMetadata || {}, model, mediaResolution, sliced));
}

module.exports = { buildRequestBody, formatUsageLine, parseArgs, MEDIA_RESOLUTION_MAP, DEFAULT_MODEL };
if (require.main === module) main();
