import type { MfarPostMessage } from '../types';

const TAG = '[MFAR:isolated]';

function safeSend(msg: { type: string }): void {
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(msg);
  } catch {
    console.warn(TAG, 'Extension context invalidated — please refresh the page');
  }
}

// Relay popup → MAIN world
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_MEDIA_INFO') {
    sendResponse({ title: document.title || null });
    return;
  }

  console.log(TAG, 'Relaying to MAIN world:', msg.type);
  const post: MfarPostMessage = { direction: 'mfar-to-main', payload: msg };
  window.postMessage(post, '*');
  sendResponse({ ok: true });
});

// Relay MAIN world → background (for tab capture fallback)
window.addEventListener('message', (event: MessageEvent<MfarPostMessage>) => {
  if (event.source !== window) return;
  if (event.data?.direction !== 'mfar-to-isolated') return;

  const msg = event.data.payload;
  console.log(TAG, 'Received from MAIN world:', msg.type);

  if (msg.type === 'HOOK_FAILED') {
    safeSend({ type: 'HOOK_FAILED' });
  }
});

console.log(TAG, 'Loaded — relay ready');
