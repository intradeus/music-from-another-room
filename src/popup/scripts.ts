import type { ContentMessage } from '../types';

const toggle = document.getElementById('toggle') as HTMLInputElement;
const grainToggle = document.getElementById('grain-toggle') as HTMLInputElement;
const cutoffSlider = document.getElementById('cutoff') as HTMLInputElement;
const freqValue = document.getElementById('freq-value')!;
const toggleSub = document.getElementById('toggle-sub')!;
const grainSub = document.getElementById('grain-sub')!;
const status = document.getElementById('status')!;

// Load saved state
chrome.storage.local.get(['enabled', 'cutoff', 'grainEnabled'], (data) => {
  const enabled = (data.enabled as boolean) ?? false;
  const cutoff = (data.cutoff as number) ?? 400;
  const grainEnabled = (data.grainEnabled as boolean) ?? false;

  toggle.checked = enabled;
  cutoffSlider.value = String(cutoff);
  freqValue.textContent = cutoff + ' Hz';
  grainToggle.checked = grainEnabled;
  updateUI(enabled);
  grainSub.textContent = grainEnabled ? 'On' : 'Off';
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  const cutoff = parseInt(cutoffSlider.value);

  chrome.storage.local.set({ enabled, cutoff });
  updateUI(enabled);
  sendToTab({ type: 'SET_STATE', enabled, cutoff });
});

grainToggle.addEventListener('change', () => {
  const grainEnabled = grainToggle.checked;
  chrome.storage.local.set({ grainEnabled });
  grainSub.textContent = grainEnabled ? 'On' : 'Off';
  sendToTab({ type: 'SET_GRAIN', enabled: grainEnabled });
});

cutoffSlider.addEventListener('input', () => {
  const cutoff = parseInt(cutoffSlider.value);
  freqValue.textContent = cutoff + ' Hz';

  chrome.storage.local.set({ cutoff });
  sendToTab({ type: 'SET_CUTOFF', cutoff });
});

function updateUI(enabled: boolean): void {
  toggleSub.textContent = enabled ? 'On — filtering audio' : 'Off';
  status.textContent = enabled ? '🎵 Effect active' : 'Effect disabled';
  status.className = 'status' + (enabled ? ' active' : '');
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
