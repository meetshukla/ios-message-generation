# iOS Message Generation

A deterministic video renderer for light-mode, iOS-style Messages
conversations. Stories are JSON files; the renderer produces a frame-perfect
H.264 MP4 with optional message sounds.

The current renderer supports:

- sent and received text bubbles;
- typing indicators and the iOS keyboard;
- Delivered-to-Read receipt transitions;
- the Messages attachment menu;
- inline Photos selection and photo messages;
- a full-screen Camera capture/review/send flow;
- configurable timing, viewport, status bar, contact, and sound settings;
- deterministic, frame-by-frame rendering at 30 fps.

No personal conversation, personal photo-library asset, or supplied screen
recording is included in this repository.

## Requirements

- macOS
- Node.js 18 or newer
- pnpm
- Google Chrome installed at `/Applications/Google Chrome.app`
- `ffmpeg` available on `PATH`

The optional message audio uses the macOS Messages system sounds. Set
`sounds.enabled` to `false` in a story when rendering without them.

## Install

```bash
pnpm install
```

## Render the media demo

```bash
pnpm capture
```

With no arguments, the command renders `story-media.json` to
`output/ios26-imessage-proof.mp4`.

To choose a story and output filename:

```bash
pnpm capture -- --story story-folk.json --output folk-sushi-imessage.mp4
```

The output filename must end in `.mp4` and contain only letters, numbers,
periods, underscores, or hyphens.

## Included stories

- `story-media.json` demonstrates the Photos and Camera attachment flows.
- `story-folk.json` demonstrates a text-only conversation.

The `examples/` directory contains rendered versions of both stories.

## Story model

Text messages and media messages share one ordered `messages` array:

```json
{
  "viewport": { "width": 720, "height": 1560 },
  "contactName": "folk",
  "avatarImage": "./assets/folk-icon.png",
  "messages": [
    { "side": "received", "text": "send me your out-of-office proof" },
    {
      "side": "sent",
      "kind": "image",
      "sendVia": "photos",
      "image": "./assets/photo-eiffel-tower.png",
      "libraryIndex": 0
    }
  ]
}
```

Local story images are embedded as data URLs before the browser opens, so a
render does not depend on a web server or remote image host.

## Assets and attribution

- The four demonstration photos are original generated placeholders. Their
  exact prompts and SHA-256 checksums are in
  [`assets/PHOTO_ASSETS.md`](assets/PHOTO_ASSETS.md).
- The Messages menu icons use Apple-published reference assets. Exact source
  URLs and checksums are in
  [`assets/menu-icons/README.md`](assets/menu-icons/README.md).
- Additional attribution and trademark notes are in
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

This repository intentionally has no open-source license. Do not assume that
third-party names, icons, or trademarks are licensed for redistribution outside
the authorized project.
