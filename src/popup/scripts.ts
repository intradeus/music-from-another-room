import type { ContentMessage, PopupMessage } from '../types';

const toggle = document.getElementById('toggle') as HTMLInputElement;
const grainToggle = document.getElementById('grain-toggle') as HTMLInputElement;
const cutoffSlider = document.getElementById('cutoff') as HTMLInputElement;
const freqValue = document.getElementById('freq-value')!;
const toggleSub = document.getElementById('toggle-sub')!;
const grainSub = document.getElementById('grain-sub')!;
const status = document.getElementById('status')!;
const wallOptions = document.getElementById('wall-options')!;
const siteNameEl = document.getElementById('site-name')!;
const mediaTitleEl = document.getElementById('media-title')!;

let currentHostname: string | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const tabId = tab?.id;

  try {
    currentHostname = tab?.url ? new URL(tab.url).hostname : null;
  } catch {
    currentHostname = null;
  }

  siteNameEl.textContent = currentHostname ?? 'Audio effects';

  // Load per-site settings, falling back to global defaults
  const siteKey = currentHostname ? `site:${currentHostname}` : null;
  const keys = siteKey
    ? [siteKey, 'captureUnavailableTabId']
    : ['enabled', 'cutoff', 'grainEnabled', 'captureUnavailableTabId'];

  chrome.storage.local.get(keys, (data) => {
    const site = siteKey ? (data[siteKey] as Record<string, unknown> | undefined) : data;

    const enabled = (site?.enabled as boolean) ?? false;
    const cutoff = (site?.cutoff as number) ?? 400;
    const grainEnabled = (site?.grainEnabled as boolean) ?? false;

    toggle.checked = enabled;
    cutoffSlider.value = String(cutoff);
    freqValue.textContent = cutoff + ' Hz';
    grainToggle.checked = grainEnabled;
    grainSub.textContent = grainEnabled ? 'On' : 'Off';
    updateUI(enabled);

    // Keep flat keys in sync so the background worker always has current values
    chrome.storage.local.set({ enabled, cutoff, grainEnabled });

    if (tabId != null && data.captureUnavailableTabId === tabId) {
      showCaptureError();
    }
  });

  // Fetch now-playing info from the page
  if (tabId != null) {
    chrome.tabs.sendMessage(tabId, { type: 'GET_MEDIA_INFO' }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      const label = formatMediaLabel(resp);
      if (!label) return;
      mediaTitleEl.textContent = label.length > 48 ? label.slice(0, 47) + '…' : label;
      mediaTitleEl.classList.add('visible');
    });
  }
});

chrome.runtime.onMessage.addListener((msg: PopupMessage) => {
  if (msg.type === 'ALL_TIERS_FAILED') showCaptureError();
});

// ─── Event listeners ─────────────────────────────────────────────────────────

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  const cutoff = parseInt(cutoffSlider.value);

  saveSiteSettings();
  chrome.storage.local.set({ enabled, cutoff });
  updateUI(enabled);
  sendToTab({ type: 'SET_STATE', enabled, cutoff });
});

grainToggle.addEventListener('change', () => {
  const grainEnabled = grainToggle.checked;

  saveSiteSettings();
  chrome.storage.local.set({ grainEnabled });
  grainSub.textContent = grainEnabled ? 'On' : 'Off';
  sendToTab({ type: 'SET_GRAIN', enabled: grainEnabled });
});

cutoffSlider.addEventListener('input', () => {
  const cutoff = parseInt(cutoffSlider.value);
  freqValue.textContent = cutoff + ' Hz';

  saveSiteSettings();
  chrome.storage.local.set({ cutoff });
  sendToTab({ type: 'SET_CUTOFF', cutoff });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMediaLabel(resp: { title?: string; artist?: string; pageTitle?: string }): string | null {
  if (resp.title && resp.artist) return `${resp.title} — ${resp.artist}`;
  if (resp.title) return resp.title;
  return resp.pageTitle ?? null;
}

function saveSiteSettings(): void {
  if (!currentHostname) return;
  chrome.storage.local.set({
    [`site:${currentHostname}`]: {
      enabled: toggle.checked,
      cutoff: parseInt(cutoffSlider.value),
      grainEnabled: grainToggle.checked,
    },
  });
}

function showCaptureError(): void {
  status.textContent = 'Audio unavailable on this page';
  status.className = 'status error';
}

function updateUI(enabled: boolean): void {
  toggleSub.textContent = enabled ? 'On' : 'Off';
  status.textContent = enabled ? 'Effect active' : 'Effect disabled';
  status.className = 'status' + (enabled ? ' active' : '');
  wallOptions.classList.toggle('open', enabled);
}

function sendToTab(message: ContentMessage): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    // Send to content script (direct Web Audio approach)
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        // Content script not loaded — background may handle via tab capture
      }
    });

    // Send to background service worker (tab capture fallback for DRM sites)
    chrome.runtime.sendMessage({
      ...message,
      type: ('BG_' + message.type) as `BG_${typeof message.type}`,
      tabId,
      // BG_SET_STATE needs grainEnabled to start capture with the correct preset state
      ...(message.type === 'SET_STATE' ? { grainEnabled: grainToggle.checked } : {}),
    });
  });
}
