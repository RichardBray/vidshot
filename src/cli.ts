#!/usr/bin/env bun

import { parseArgs } from "util";
import { $ } from "bun";
import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    zoom: { type: "string", default: "1" },
    "zoom-to": { type: "string" },
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
    vignette: { type: "string" },
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
  --scroll [px]         Slow scroll down this many pixels (default: 40)
  --zoom-to <factor>    Animate zoom from --zoom to this factor

Options:
  --zoom <factor>       Starting zoom level (default: 1)
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
  --vignette <amount>    Vignette intensity (default: 0.35, 0.55 with --dark)
  --no-hance            Skip hance processing
  --device <name>       Device emulation (e.g. "iPhone 15")
  --dark                Use dark color scheme
  -h, --help            Show this help

Examples:
  # Scroll down a page
  vidshot https://example.com --scroll 40

  # Scroll while zoomed in
  vidshot https://example.com --scroll 40 --zoom 1.2

  # Animated zoom into a page
  vidshot https://example.com --zoom-to 1.3

  # Start zoomed in, animate further
  vidshot https://example.com --zoom 1.2 --zoom-to 1.5

  # Highlight text and auto-scroll to it
  vidshot https://example.com --scroll 40 --highlight "important quote here"

  # Raw video without hance effects
  vidshot https://example.com --scroll 40 --no-hance

  # Use your real browser for sites that block headless (Reddit, etc.)
  vidshot https://reddit.com/r/ClaudeAI --cdp 9222 --scroll 40`);
  process.exit(0);
}

const url = positionals[0];
const zoom = parseFloat(values.zoom!);
const zoomTo = values["zoom-to"] ? parseFloat(values["zoom-to"]) : null;
const scrollPx = values.scroll ? (parseInt(values.scroll) || 40) : 0;
const duration = parseFloat(values.duration!);
const fps = parseInt(values.fps!);
const width = parseInt(values.width!);
const height = parseInt(values.height!);
const wait = parseInt(values.wait!);
const hasZoomAnim = zoomTo !== null && zoomTo !== zoom;
const mode = scrollPx > 0 ? "scroll" : hasZoomAnim ? "zoom" : "static";

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
      const normalize = s => s.replace(/[‘’′]/g, "'").replace(/[“”]/g, '"').replace(/—/g, '--').replace(/–/g, '-').replace(/×/g, 'x').toLowerCase();
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
  } else if (mode === "zoom") {
    console.log(`🎥 Creating ${duration}s clip (zoom: ${zoom}→${zoomTo}x)...`);

    const ss = 4;
    const ssW = width * ss;
    const ssH = height * ss;

    const zoomExpr = `${zoom}+(${zoomTo! - zoom})*on/${totalFrames}`;
    const xExpr = `iw/2-(iw/zoom/2)`;
    const yExpr = `ih/2-(ih/zoom/2)`;

    const filter = [
      `scale=${ssW}:${ssH}:flags=lanczos`,
      `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${ssW}x${ssH}:fps=${fps}`,
      `scale=${width}:${height}:flags=lanczos`,
    ].join(",");

    await $`ffmpeg -y -loop 1 -i ${rawShot} -vf ${filter} -t ${String(duration)} -c:v libx264 -pix_fmt yuv420p -crf 18 ${driftVideo}`.quiet();
  } else {
    console.log(`🎥 Creating ${duration}s clip (static zoom: ${zoom}x)...`);

    const ss = 2;
    const ssW = width * ss;
    const ssH = height * ss;
    const zoomW = Math.round(ssW * zoom);
    const cropX = Math.round((zoomW - ssW) / 2);
    const cropY = Math.round((Math.round(ssH * zoom) - ssH) / 2);

    const filter = `scale=${zoomW}:-1,crop=${ssW}:${ssH}:${cropX}:${cropY},scale=${width}:${height}`;

    await $`ffmpeg -y -loop 1 -framerate ${String(fps)} -i ${rawShot} -vf ${filter} -t ${String(duration)} -c:v libx264 -pix_fmt yuv420p -crf 18 ${driftVideo}`.quiet();
  }
}

async function hance() {
  if (values["no-hance"]) {
    await $`cp ${driftVideo} ${output}`.quiet();
    return;
  }

  console.log(`🎬 Applying hance effects...`);

  const extra = values["hance-args"]
    ? values["hance-args"].split(" ").filter(Boolean)
    : [];

  const usePreset = values.preset !== "default";

  if (usePreset) {
    await $`hance ${driftVideo} -o ${output} --preset ${values.preset!} ${extra}`.quiet();
  } else {
    const vignette = values.vignette ? parseFloat(values.vignette) : values.dark ? 0.55 : 0.35;
    await $`hance ${driftVideo} -o ${output} --no-grain --no-camera-shake --aberration 0.15 --vignette-amount ${vignette} ${extra}`.quiet();
  }
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
