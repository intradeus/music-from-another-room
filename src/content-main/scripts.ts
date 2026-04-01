import type { ContentMessage, MfarPostMessage } from '../types';

const TAG = '[MFAR:main]';

let audioContext: AudioContext | null = null;
let filterNode: BiquadFilterNode | null = null;
let gainNode: GainNode | null = null;
let isEnabled = false;
let cutoffHz = 400;
let hookDegraded = false;

const processedElements = new WeakSet<HTMLMediaElement>();

function getOrCreateContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log(TAG, 'Created AudioContext, state:', audioContext.state);
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
    console.log(TAG, 'Resumed suspended AudioContext');
  }
  return audioContext;
}

function hookMediaElement(mediaElement: HTMLMediaElement): void {
  if (processedElements.has(mediaElement)) return;
  processedElements.add(mediaElement);

  console.log(TAG, 'Attempting to hook:', mediaElement.tagName, mediaElement.src || '(no src)');

  try {
    const ctx = getOrCreateContext();
    const source = ctx.createMediaElementSource(mediaElement);

    filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = isEnabled ? cutoffHz : 20000;
    filterNode.Q.value = 0.8;

    gainNode = ctx.createGain();
    gainNode.gain.value = isEnabled ? 0.65 : 1.0;

    source.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    console.log(TAG, 'Hooked successfully. Filter:', filterNode.frequency.value, 'Hz, Gain:', gainNode.gain.value);

    verifySourceAudio(ctx, source, mediaElement);
  } catch (err) {
    console.warn(TAG, 'Could not hook element:', (err as Error).message);
    notifyHookFailed();
  }
}

/**
 * Verify audio actually flows through the MediaElementSource.
 * DRM (EME/Widevine) causes Chrome to silently zero out the samples
 * while the original audio keeps playing through the normal output path.
 */
function verifySourceAudio(
  ctx: AudioContext,
  source: MediaElementAudioSourceNode,
  mediaElement: HTMLMediaElement
): void {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  let silentChecks = 0;

  const interval = setInterval(() => {
    if (mediaElement.paused || mediaElement.readyState < 2) return;

    analyser.getFloatTimeDomainData(buf);
    const hasSignal = buf.some((v) => Math.abs(v) > 0.0001);

    if (hasSignal) {
      clearInterval(interval);
      console.log(TAG, 'Audio signal confirmed — direct hook is working');
      return;
    }

    silentChecks++;
    if (silentChecks >= 15) {
      clearInterval(interval);
      console.warn(TAG, 'Source is silent despite media playing — DRM/CORS detected, requesting tab capture');

      source.disconnect();
      filterNode?.disconnect();
      gainNode?.disconnect();
      filterNode = null;
      gainNode = null;
      hookDegraded = true;

      notifyHookFailed();
    }
  }, 100);
}

function notifyHookFailed(): void {
  const msg: MfarPostMessage = {
    direction: 'mfar-to-isolated',
    payload: { type: 'HOOK_FAILED' },
  };
  window.postMessage(msg, '*');
}

function scanForMediaElements(): void {
  if (hookDegraded) return;
  const elements = document.querySelectorAll<HTMLMediaElement>('video, audio');
  console.log(TAG, 'Scan found', elements.length, 'media element(s)');
  elements.forEach(hookMediaElement);
}

// Watch for dynamically added media elements (YouTube is a SPA)
const observer = new MutationObserver(() => scanForMediaElements());
observer.observe(document.documentElement, { childList: true, subtree: true });

// Initial scan
scanForMediaElements();

// Listen for messages relayed from the ISOLATED world content script
window.addEventListener('message', (event: MessageEvent<MfarPostMessage>) => {
  if (event.source !== window) return;
  if (event.data?.direction !== 'mfar-to-main') return;

  const msg = event.data.payload as ContentMessage;
  console.log(TAG, 'Received message:', msg.type, msg);

  if (msg.type === 'SET_STATE') {
    isEnabled = msg.enabled;
    cutoffHz = msg.cutoff ?? cutoffHz;

    if (filterNode && audioContext) {
      const now = audioContext.currentTime;
      filterNode.frequency.cancelScheduledValues(now);
      filterNode.frequency.setTargetAtTime(isEnabled ? cutoffHz : 20000, now, 0.05);
    }

    if (gainNode && audioContext) {
      const now = audioContext.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(isEnabled ? 0.65 : 1.0, now, 0.05);
    }

    scanForMediaElements();
  }

  if (msg.type === 'SET_CUTOFF') {
    cutoffHz = msg.cutoff;
    if (filterNode && isEnabled && audioContext) {
      const now = audioContext.currentTime;
      filterNode.frequency.cancelScheduledValues(now);
      filterNode.frequency.setTargetAtTime(cutoffHz, now, 0.05);
    }
  }
});

console.log(TAG, 'Loaded in MAIN world — ready');
