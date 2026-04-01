// --- Messages from popup → content script (via chrome.tabs.sendMessage) ---

export interface SetStateMessage {
  type: 'SET_STATE';
  enabled: boolean;
  cutoff: number;
}

export interface SetCutoffMessage {
  type: 'SET_CUTOFF';
  cutoff: number;
}

export type ContentMessage = SetStateMessage | SetCutoffMessage;

// --- Messages from popup → background (via chrome.runtime.sendMessage) ---

export interface BgSetStateMessage {
  type: 'BG_SET_STATE';
  tabId: number;
  enabled: boolean;
  cutoff: number;
}

export interface BgSetCutoffMessage {
  type: 'BG_SET_CUTOFF';
  tabId: number;
  cutoff: number;
}

export interface HookFailedMessage {
  type: 'HOOK_FAILED';
}

export type BackgroundMessage = BgSetStateMessage | BgSetCutoffMessage | HookFailedMessage;

// --- Messages from background → offscreen (via chrome.runtime.sendMessage) ---

export interface StartCaptureMessage {
  type: 'MFAR_START_CAPTURE';
  streamId: string;
  tabId: number;
  cutoff: number;
  enabled: boolean;
}

export interface UpdateFilterMessage {
  type: 'MFAR_UPDATE_FILTER';
  tabId: number;
  cutoff: number;
}

export interface StopCaptureMessage {
  type: 'MFAR_STOP_CAPTURE';
  tabId: number;
}

export type OffscreenMessage = StartCaptureMessage | UpdateFilterMessage | StopCaptureMessage;

// --- PostMessage between MAIN ↔ ISOLATED content script worlds ---

export interface MfarPostMessage {
  direction: 'mfar-to-main' | 'mfar-to-isolated';
  payload: ContentMessage | { type: 'HOOK_FAILED' };
}
