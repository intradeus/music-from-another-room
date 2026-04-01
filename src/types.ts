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

export interface SetGrainMessage {
  type: 'SET_GRAIN';
  enabled: boolean;
}

export type ContentMessage = SetStateMessage | SetCutoffMessage | SetGrainMessage;

// --- Messages from popup → background (via chrome.runtime.sendMessage) ---

export interface BgSetStateMessage {
  type: 'BG_SET_STATE';
  tabId: number;
  enabled: boolean;
  cutoff: number;
  grainEnabled: boolean;
}

export interface BgSetCutoffMessage {
  type: 'BG_SET_CUTOFF';
  tabId: number;
  cutoff: number;
}

export interface HookFailedMessage {
  type: 'HOOK_FAILED';
}

export interface BgSetGrainMessage {
  type: 'BG_SET_GRAIN';
  tabId: number;
  enabled: boolean;
}

export type BackgroundMessage = BgSetStateMessage | BgSetCutoffMessage | BgSetGrainMessage | HookFailedMessage;

// --- Messages from background → offscreen (via chrome.runtime.sendMessage) ---

export interface StartCaptureMessage {
  type: 'MFAR_START_CAPTURE';
  streamId: string;
  tabId: number;
  cutoff: number;
  enabled: boolean;
  grainEnabled: boolean;
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

export interface UpdateGrainMessage {
  type: 'MFAR_UPDATE_GRAIN';
  tabId: number;
  enabled: boolean;
}

export type OffscreenMessage = StartCaptureMessage | UpdateFilterMessage | UpdateGrainMessage | StopCaptureMessage;

// --- Messages from background → popup (via chrome.runtime.sendMessage) ---

export interface AllTiersFailedMessage {
  type: 'ALL_TIERS_FAILED';
}

export type PopupMessage = AllTiersFailedMessage;

// --- PostMessage between MAIN ↔ ISOLATED content script worlds ---

export interface MfarPostMessage {
  direction: 'mfar-to-main' | 'mfar-to-isolated';
  payload: ContentMessage | { type: 'HOOK_FAILED' };
}
