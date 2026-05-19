#!/usr/bin/env bun

import { parseArgs } from "util";
import { $ } from "bun";
import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    zoom: { type: "string", default: "1.05" },
    scroll: { type: "string" },
    offset: { type: "string", default: "20" },
    duration: { type: "string", short: "d", default: "3" },
    fps: { type: "string", default: "30" },
    output: { type: "string", short: "o" },
    width: { type: "string", default: "1920" },
    height: { type: "string", default: "1080" },
    wait: { type: "string", default: "2000" },
    preset: { type: "string", default: "default" },
    "hance-args": { type: "string", default: "" },
    highlight: { type: "string" },
    "no-hance": { type: "boolean", default: false },
    device: { type: "string" },
    cdp: { type: "string" },
    dark: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
  strict: true,
});

if (values.help || positionals.length === 0) {
  console.log(`vidshot - Screenshot websites → cinematic video clips

Usage: vidshot <url> [options]

Takes a screenshot, animates zoom or scroll over the duration,
then runs hance for chromatic aberration, vignette, bloom, etc.
Automatically removes nav bars, cookie banners, and sticky elements.

Modes:
  --zoom <factor>       Animated zoom drift from 1x to this (default: 1.05)
  --scroll [px]         Slow scroll down this many pixels (default: 40)
                        Combine with --zoom for static zoom + scroll

Options:
  --highlight <text>    Highlight text on the page and scroll to it
  --offset <px>         Start this many pixels down the page (default: 20)
  -d, --duration <sec>  Clip duration in seconds (default: 3)
  --fps <num>           Frame rate (default: 30)
  -o, --output <path>   Output file (default: vidshot_<timestamp>.mp4)
  --width <px>          Viewport width (default: 1920)
  --height <px>         Viewport height (default: 1080)
  --wait <ms>           Wait after page load (default: 2000)
  --preset <name>       Hance preset name (default: default)
  --hance-args <str>    Extra args passed to hance (e.g. "--aberration 0.5")
  --cdp <port>          Connect to existing browser via CDP (e.g. 9222)
  --no-hance            Skip hance processing
  --device <name>       Device emulation (e.g. "iPhone 15")
  --dark                Use dark color scheme
  -h, --help            Show this help

Examples:
  # Slow zoom into a page with cinematic effects
  vidshot https://example.com

  # Scroll down a page, zoomed in slightly
  vidshot https://example.com --scroll 40 --zoom 1.2

  # Highlight text and auto-scroll to it
  vidshot https://example.com --scroll 40 --highlight "important quote here"

  # Longer clip, custom output
  vidshot https://example.com --scroll 60 --zoom 1.3 -d 5 -o hero.mp4

  # Raw video without hance effects
  vidshot https://example.com --scroll 40 --no-hance

  # Use your real browser for sites that block headless (Reddit, etc.)
  vidshot https://reddit.com/r/ClaudeAI --cdp 9222 --scroll 40`);
  process.exit(0);
}

const url = positionals[0];
const zoom = parseFloat(values.zoom!);
const scrollPx = values.scroll ? (parseInt(values.scroll) || 40) : 0;
const duration = parseFloat(values.duration!);
const fps = parseInt(values.fps!);
const width = parseInt(values.width!);
const height = parseInt(values.height!);
const wait = parseInt(values.wait!);
const mode = scrollPx > 0 ? "scroll" : "zoom";

const tmp = join(tmpdir(), `vidshot_${Date.now()}`);
mkdirSync(tmp, { recursive: true });

const rawShot = join(tmp, "raw.png");
const driftVideo = join(tmp, "drift.mp4");
const output = resolve(values.output ?? `vidshot_${Date.now()}.mp4`);
let highlightY = 0;

async function screenshot() {
  console.log(`📸 Screenshotting ${url}...`);

  if (values.cdp) {
    await $`agent-browser connect ${values.cdp}`.quiet();
  }
  await $`agent-browser open ${url}`.quiet();
  await $`agent-browser set viewport ${String(width)} ${String(height)}`.quiet();

  if (values.device) {
    await $`agent-browser set device ${values.device}`.quiet();
  }
  if (values.dark) {
    await $`agent-browser set media dark`.quiet();
  }

  await $`agent-browser wait ${String(wait)}`.quiet();

  // Remove cookie banners, nav bars, and sticky headers
  try {
    await $`agent-browser eval ${`
      // Cookie banners
      document.querySelectorAll('[class*=cookie],[class*=consent],[id*=cookie],[id*=consent],[aria-label*=Cookie],[aria-label*=cookie]').forEach(el => el.remove());
      // Nav, header, sticky elements
      document.querySelectorAll('nav, [role=banner], [class*=nav], [class*=Nav], [class*=sticky], [class*=Sticky]').forEach(el => el.remove());
      // Fixed/sticky positioned elements (navs, banners, toolbars)
      document.querySelectorAll('*').forEach(el => {
        const s = getComputedStyle(el);
        if (s.position === 'fixed' || s.position === 'sticky') el.remove();
      });
    `}`.quiet();
  } catch {}
  try { await $`agent-browser find role button click "Reject All"`.quiet(); } catch {}
  try { await $`agent-browser find role button click "Accept"`.quiet(); } catch {}
  try { await $`agent-browser find role button click "I Accept"`.quiet(); } catch {}
  try { await $`agent-browser find role button click "Accept All"`.quiet(); } catch {}
  await $`agent-browser wait 500`.quiet();

  if (values.highlight) {
    const text = values.highlight.replace(/'/g, "\\'");
    const result = await $`agent-browser eval ${`
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const normalize = s => s.replace(/[‘’′]/g, "'").replace(/[“”]/g, '"').replace(/—/g, '--').replace(/–/g, '-');
      const target = normalize('${text}');
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const idx = normalize(node.textContent).indexOf(target);
        if (idx === -1) continue;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + target.length);
        const mark = document.createElement('mark');
        mark.id = '__vidshot_mark';
        mark.style.cssText = 'background: #facc15; color: #000; padding: 2px 4px; border-radius: 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone;';
        range.surroundContents(mark);
        break;
      }
      const m = document.getElementById('__vidshot_mark');
      m ? Math.round(m.getBoundingClientRect().top + window.scrollY) : 0;
    `}`.quiet();
    const yMatch = result.stdout.toString().match(/(\d+)/);
    if (yMatch) {
      highlightY = parseInt(yMatch[1]);
    }
    await $`agent-browser wait 300`.quiet();
  }

  if (mode === "scroll") {
    await $`agent-browser screenshot ${rawShot} --full`.quiet();
  } else {
    await $`agent-browser screenshot ${rawShot}`.quiet();
  }
}

async function createDriftVideo() {
  const totalFrames = Math.round(duration * fps);

  if (mode === "scroll") {
    console.log(`🎥 Creating ${duration}s clip (scroll down)...`);

    // Generate individual frames by cropping a sliding window down the tall screenshot
    // Using crop filter with frame-based y offset via sendcmd or expression
    // crop's y supports expressions with 't' (time in seconds)
    // Supersample at 4x to get smooth sub-pixel scrolling, then scale back down
    const ss = 2;
    const ssW = width * ss;
    const ssH = height * ss;
    const zoomW = Math.round(ssW * zoom);
    const cropX = Math.round((zoomW - ssW) / 2);

    const defaultOffset = parseInt(values.offset!);
    const scaledHighlightY = Math.round(highlightY * zoom * ss);
    const startY = highlightY > 0
      ? Math.max(0, scaledHighlightY - Math.round(ssH / 2))
      : Math.round(defaultOffset * zoom * ss);
    const scaledScrollPx = Math.round(scrollPx * zoom * ss);
    const yExpr = `${startY}+${scaledScrollPx}*t/${duration}`;

    const filter = `scale=${zoomW}:-1,crop=${ssW}:${ssH}:${cropX}:'${yExpr}',scale=${width}:${height}`;

    await $`ffmpeg -y -loop 1 -framerate ${String(fps)} -i ${rawShot} -vf ${filter} -t ${String(duration)} -c:v libx264 -pix_fmt yuv420p -crf 18 ${driftVideo}`.quiet();
  } else {
    console.log(`🎥 Creating ${duration}s clip (zoom: 1→${zoom}x)...`);

    const oversample = Math.max(zoom, 1.5);
    const srcW = Math.round(width * oversample);
    const srcH = Math.round(height * oversample);

    const zoomExpr = `1+(${zoom}-1)*on/${totalFrames}`;
    const xExpr = `iw/2-(iw/zoom/2)`;
    const yExpr = `ih/2-(ih/zoom/2)`;

    const filter = [
      `scale=${srcW}:${srcH}`,
      `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
    ].join(",");

    await $`ffmpeg -y -loop 1 -i ${rawShot} -vf ${filter} -t ${String(duration)} -c:v libx264 -pix_fmt yuv420p -crf 18 ${driftVideo}`.quiet();
  }
}

async function hance() {
  if (values["no-hance"]) {
    await $`cp ${driftVideo} ${output}`.quiet();
    return;
  }

  console.log(`🎬 Applying hance effects...`);

  const args = values["hance-args"]
    ? values["hance-args"].split(" ").filter(Boolean)
    : [];

  await $`hance ${driftVideo} -o ${output} --preset ${values.preset!} --no-grain --no-camera-shake --aberration 0.15 --vignette-amount 0.4 ${args}`.quiet();
}

try {
  await screenshot();
  await createDriftVideo();
  await hance();
  await $`rm -rf ${tmp}`.quiet();
  console.log(`✅ ${output}`);
} catch (err: any) {
  console.error(`❌ ${err.stderr?.toString() || err.message}`);
  await $`rm -rf ${tmp}`.quiet();
  process.exit(1);
}
