# Music From Another Room (MFAR) — Claude Context

Chrome MV3 extension that applies a low-pass filter to audio on YouTube, Spotify, and SoundCloud to simulate music playing through a wall. Built with [extension.js](https://github.com/extension-js/extension.js).

## Commands

- `npm run dev` — hot-reload dev build
- `npm run build` — production build

## Architecture

Two-tier audio interception depending on the site.

### Tier 1 — Direct Web Audio hook (YouTube...)

`content-main/scripts.ts` runs in `"world": "MAIN"` so it shares the JS context with the page's `<video>`/`<audio>` elements. It calls `createMediaElementSource()` to intercept audio, routes it through a `BiquadFilterNode` (lowpass) → `GainNode` → speakers. An `AnalyserNode` verifies audio is actually flowing — DRM/CORS causes the source to silently output zeros.

### Tier 2 — Tab capture fallback (Spotify, SoundCloud...)

- **Spotify** uses Widevine DRM — `createMediaElementSource()` succeeds without throwing but outputs silent zeros; detected via AnalyserNode sampling (~15 checks × 100ms)
- **SoundCloud** uses Web Audio API directly with no `<audio>`/`<video>` elements — skips Tier 1 entirely via `TAB_CAPTURE_ONLY` list in `content/scripts.ts`

On failure: MAIN world posts `HOOK_FAILED` via `window.postMessage` → ISOLATED relay (`content/scripts.ts`) → background service worker → `chrome.tabCapture.getMediaStreamId()` → mutes tab → creates offscreen document → `public/offscreen/scripts.js` captures and filters audio.

### Messaging flow

```
popup → chrome.tabs.sendMessage    → content/scripts.ts (ISOLATED)
                                         ↕ window.postMessage
                                     content-main/scripts.ts (MAIN)

popup → chrome.runtime.sendMessage → background.ts
                                         ↕ chrome.runtime.sendMessage
                                     public/offscreen/scripts.js
```

## File Structure

```
src/
  manifest.json               — MV3 manifest
  types.ts                    — shared message interfaces
  background.ts               — service worker, tab capture orchestration
  content/scripts.ts          — ISOLATED world relay + safeSend guard
  content-main/scripts.ts     — MAIN world Web Audio hook + DRM detection
  popup/
    index.html
    scripts.ts
    styles.css
  images/icon.png
public/offscreen/
  index.html
  scripts.js                  — vanilla JS (not bundled by extension.js)
```

## Key Gotchas

- **MAIN world required** — `createMediaElementSource()` only works in the MAIN world; content scripts default to ISOLATED in MV3. This was the original bug.
- **offscreen in public/** — extension.js only bundles files referenced in the manifest. The offscreen document must live in `public/` as a static asset.
- **`chrome.offscreen` permission** — must be listed in manifest permissions or the API won't exist.
- **Spotify DRM silence** — hook doesn't throw; you must detect zeros via AnalyserNode sampling.
- **SoundCloud skip** — `TAB_CAPTURE_ONLY` list in `content/scripts.ts` sends `HOOK_FAILED` immediately on load.
- **Extension context guard** — all `chrome.runtime.sendMessage` calls in content scripts are wrapped with `chrome.runtime?.id` check + try/catch to handle "Extension context invalidated" on reload.
- **SW state is ephemeral** — `needsCapture` and `activeCaptures` Sets in `background.ts` are lost when the service worker is terminated. Re-navigating to the page re-triggers `HOOK_FAILED` and re-registers the tab, so this self-heals on navigation but not on toggle-off/toggle-on without navigation.
- **Multiple frames** — `all_frames: true` in manifest means content scripts run in iframes too. Each frame gets its own module instance, which is correct for YouTube embeds.
- **Filter defaults** — lowpass BiquadFilter, default cutoff 400 Hz, Q=0.8. Gain: 0.65 when enabled, 1.0 when disabled. Cutoff slider range: 100–1200 Hz.
- **Dual-path messaging from popup** — popup sends every state change both to the content script (direct hook path) and to background (tab capture path). Background ignores messages for tabs not in `needsCapture`.