# vidshot

Screenshot websites → cinematic video clips.

Takes a browser screenshot, applies animated zoom or scroll, then runs [hance](https://github.com/Orva-Studio/hancer) for chromatic aberration, vignette, and bloom. Built for creating B-roll footage from websites for video production.

## Prerequisites

- [Bun](https://bun.sh)
- [agent-browser](https://github.com/nichochar/agent-browser)
- [ffmpeg](https://ffmpeg.org)
- [hance](https://github.com/Orva-Studio/hancer) (optional — skip with `--no-hance`)

## Install

```bash
git clone https://github.com/RichardBray/vidshot.git
cd vidshot
bun install
bun link
```

## Usage

```bash
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
vidshot https://reddit.com/r/ClaudeAI --cdp 9222 --scroll 40
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--zoom <factor>` | Zoom level — animated drift in zoom mode, static in scroll mode | `1.05` |
| `--scroll [px]` | Scroll down this many pixels over the duration | `40` |
| `--highlight <text>` | Highlight matching text on the page and scroll to it | — |
| `--offset <px>` | Start this many pixels down the page | `20` |
| `-d, --duration <sec>` | Clip duration in seconds | `3` |
| `--fps <num>` | Frame rate | `30` |
| `-o, --output <path>` | Output file path | `vidshot_<timestamp>.mp4` |
| `--width <px>` | Viewport width | `1920` |
| `--height <px>` | Viewport height | `1080` |
| `--wait <ms>` | Wait after page load | `2000` |
| `--cdp <port>` | Connect to existing browser via CDP | — |
| `--preset <name>` | Hance preset name | `default` |
| `--hance-args <str>` | Extra args passed to hance | — |
| `--no-hance` | Skip hance processing | `false` |
| `--device <name>` | Device emulation (e.g. "iPhone 15") | — |
| `--dark` | Use dark color scheme | `false` |

## How it works

1. **Screenshot** — Opens the URL with agent-browser, removes nav bars/cookie banners/sticky elements, takes a screenshot
2. **Animate** — Uses ffmpeg to create a video with animated zoom drift or smooth scroll pan
3. **Effects** — Runs hance for chromatic aberration, vignette, bloom, and halation (no grain or camera shake)

## License

MIT
