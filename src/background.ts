import type { BackgroundMessage, OffscreenMessage } from './types';

const TAG = '[MFAR:bg]';

const needsCapture = new Set<number>();
const activeCaptures = new Set<number>();

chrome.runtime.onMessage.addListener(
  (msg: BackgroundMessage, sender: chrome.runtime.MessageSender) => {
    if (msg.type === 'HOOK_FAILED') {
      const tabId = sender.tab?.id;
      if (tabId == null) return;

      console.log(TAG, 'Tab', tabId, 'needs tab capture (Web Audio hook failed)');
      needsCapture.add(tabId);

      chrome.storage.local.get(['enabled', 'cutoff', 'grainEnabled'], (data) => {
        if (data.enabled && !activeCaptures.has(tabId)) {
          startCapture(tabId, (data.cutoff as number) ?? 400, !!data.grainEnabled);
        }
      });
    }

    if (msg.type === 'BG_SET_STATE') {
      if (!needsCapture.has(msg.tabId)) return;
      if (msg.enabled && !activeCaptures.has(msg.tabId)) {
        startCapture(msg.tabId, msg.cutoff ?? 400, msg.grainEnabled);
      } else if (!msg.enabled && activeCaptures.has(msg.tabId)) {
        stopCapture(msg.tabId);
      }
    }

    if (msg.type === 'BG_SET_CUTOFF') {
      if (!activeCaptures.has(msg.tabId)) return;
      forward({ type: 'MFAR_UPDATE_FILTER', tabId: msg.tabId, cutoff: msg.cutoff });
    }

    if (msg.type === 'BG_SET_GRAIN') {
      if (!activeCaptures.has(msg.tabId)) return;
      forward({ type: 'MFAR_UPDATE_GRAIN', tabId: msg.tabId, enabled: msg.enabled });
    }
  }
);

async function startCapture(tabId: number, cutoff: number, grainEnabled: boolean): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { muted: true });

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    console.log(TAG, 'Got stream ID for tab', tabId);

    await ensureOffscreen();

    await forward({
      type: 'MFAR_START_CAPTURE',
      streamId,
      tabId,
      cutoff,
      enabled: true,
      grainEnabled,
    });

    activeCaptures.add(tabId);
    console.log(TAG, 'Capture active for tab', tabId);
  } catch (err) {
    console.error(TAG, 'startCapture failed:', err);
    chrome.tabs.update(tabId, { muted: false }).catch(() => {});
  }
}

async function stopCapture(tabId: number): Promise<void> {
  chrome.tabs.update(tabId, { muted: false }).catch(() => {});
  forward({ type: 'MFAR_STOP_CAPTURE', tabId });
  activeCaptures.delete(tabId);
  console.log(TAG, 'Capture stopped for tab', tabId);
}

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/index.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Filter tab audio for Music From Another Room effect',
  });
  console.log(TAG, 'Offscreen document created');
}

function forward(msg: OffscreenMessage): Promise<void> {
  return chrome.runtime.sendMessage(msg).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => {
  needsCapture.delete(tabId);
  if (activeCaptures.has(tabId)) {
    activeCaptures.delete(tabId);
    forward({ type: 'MFAR_STOP_CAPTURE', tabId });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    needsCapture.delete(tabId);
    if (activeCaptures.has(tabId)) {
      stopCapture(tabId);
    }
  }
});
