import type { ContentMessage, MfarPostMessage } from '../types';
import {
  WALL_Q,
  WALL_BYPASS_HZ,
  WALL_GAIN_ON,
  WALL_GAIN_OFF,
  buildWallChain,
  setAudioParam,
  buildGrainChain,
  teardownGrainChain,
  type GrainChain,
} from '../filter-chain';

const TAG = '[MFAR:main]';

let audioContext: AudioContext | null = null;
let filterNode: BiquadFilterNode | null = null;
let gainNode: GainNode | null = null;
let isEnabled = false;
let cutoffHz = 400;
let usingTabCapture = false;       // true = in-page tiers exhausted, background tab capture is handling it
let mediaElementHookActive = false; // true = Tier 1 (media element hook) succeeded
let buildingChain = false;          // true = chain is being constructed, suppress monkey-patch intercept
let grainEnabled = false;
let grainChain: GrainChain | null = null;

const processedElements = new WeakSet<HTMLMediaElement>();

// Save original before patching — used inside the patch and for bypass connections
const origConnect = AudioNode.prototype.connect;

// ─── Tier 1: direct media element hook ───────────────────────────────────────

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

  console.log(TAG, 'Tier 1: Attempting to hook:', mediaElement.tagName, mediaElement.src || '(no src)');

  try {
    const ctx = getOrCreateContext();
    const source = ctx.createMediaElementSource(mediaElement);

    buildingChain = true;
    try {
      const { wallFilterNode, wallGainNode } = buildWallChain(ctx, source, isEnabled, cutoffHz);
      filterNode = wallFilterNode;
      gainNode = wallGainNode;
      applyGrain();
    } finally {
      buildingChain = false;
    }
    mediaElementHookActive = true;

    console.log(TAG, 'Tier 1: Hooked. Filter:', filterNode!.frequency.value, 'Hz, Gain:', gainNode!.gain.value);
    verifySourceAudio(ctx, source, mediaElement);
  } catch (err) {
    buildingChain = false;
    console.warn(TAG, 'Tier 1: Could not hook element:', (err as Error).message);
    notifyHookFailed();
  }
}

/**
 * Verify audio actually flows through the MediaElementSource.
 * DRM (EME/Widevine) causes Chrome to silently zero out the samples
 * while the original audio keeps playing through the normal output path.
 * On DRM detection we skip Tier 2 (monkey-patch can't help with DRM)
 * and escalate directly to Tier 3 (tab capture).
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
      console.log(TAG, 'Tier 1: Audio signal confirmed — direct hook working');
      return;
    }

    silentChecks++;
    if (silentChecks >= 15) {
      clearInterval(interval);
      console.warn(TAG, 'Tier 1: DRM/CORS detected — skipping Tier 2, escalating to Tier 3 (tab capture)');

      source.disconnect();
      filterNode?.disconnect();
      gainNode?.disconnect();
      filterNode = null;
      gainNode = null;
      mediaElementHookActive = false;
      usingTabCapture = true;

      notifyHookFailed();
    }
  }, 100);
}

// ─── Tier 2: AudioNode.prototype.connect monkey-patch ────────────────────────

function installWebAudioPatch(): void {
  const patchedContexts = new WeakMap<AudioContext, { filterNode: BiquadFilterNode; gainNode: GainNode }>();

  (AudioNode.prototype as any).connect = function (
    destination: AudioNode | AudioParam,
    ...args: number[]
  ) {
    if (!mediaElementHookActive && !usingTabCapture && !buildingChain && destination instanceof AudioDestinationNode) {
      const ctx = (destination as AudioDestinationNode).context as AudioContext;

      if (!patchedContexts.has(ctx)) {
        console.log(TAG, 'Tier 2: Intercepted Web Audio connection — installing filter chain');

        const fNode = ctx.createBiquadFilter();
        fNode.type = 'lowpass';
        fNode.frequency.value = isEnabled ? cutoffHz : WALL_BYPASS_HZ;
        fNode.Q.value = WALL_Q;

        const gNode = ctx.createGain();
        gNode.gain.value = isEnabled ? WALL_GAIN_ON : WALL_GAIN_OFF;

        fNode.connect(gNode); // gNode is not AudioDestinationNode — safe, no interception
        (origConnect as Function).call(gNode, destination); // bypass patch: gNode → real destination

        patchedContexts.set(ctx, { filterNode: fNode, gainNode: gNode });

        // Write to shared refs so SET_STATE / SET_CUTOFF / SET_GRAIN handlers work unchanged
        filterNode = fNode;
        gainNode = gNode;
        audioContext = ctx;

        verifyTier2Audio(ctx, fNode);
      }

      const chain = patchedContexts.get(ctx)!;
      return (origConnect as Function).call(this, chain.filterNode, ...args); // redirect: this → filterNode
    }

    return (origConnect as any).call(this, destination, ...args);
  };
}

/**
 * Sample the filter output to confirm audio is flowing through Tier 2.
 * Only escalates to Tier 3 if we've NEVER seen a signal — a pause after
 * playback starts is fine and should not trigger escalation.
 */
function verifyTier2Audio(ctx: AudioContext, node: BiquadFilterNode): void {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  (origConnect as Function).call(node, analyser); // tap filter output, bypassing the patch

  const buf = new Float32Array(analyser.fftSize);
  let silentChecks = 0;
  let everHadSignal = false;

  const interval = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const hasSignal = buf.some((v) => Math.abs(v) > 0.0001);

    if (hasSignal) {
      if (!everHadSignal) {
        everHadSignal = true;
        console.log(TAG, 'Tier 2: Audio signal confirmed — Web Audio patch working');
      }
      silentChecks = 0;
      return;
    }

    if (everHadSignal) return; // had signal before — user paused, do not escalate

    silentChecks++;
    if (silentChecks >= 30) { // 3s of silence, never had a signal
      clearInterval(interval);
      console.warn(TAG, 'Tier 2: No audio detected — escalating to Tier 3 (tab capture)');
      filterNode = null;
      gainNode = null;
      audioContext = null;
      usingTabCapture = true;
      notifyHookFailed();
    }
  }, 100);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function notifyHookFailed(): void {
  const msg: MfarPostMessage = {
    direction: 'mfar-to-isolated',
    payload: { type: 'HOOK_FAILED' },
  };
  window.postMessage(msg, '*');
}

function applyGrain(): void {
  if (!audioContext) return;
  if (grainEnabled && !grainChain) {
    buildingChain = true;
    try {
      grainChain = buildGrainChain(audioContext);
    } finally {
      buildingChain = false;
    }
  } else if (!grainEnabled && grainChain) {
    teardownGrainChain(grainChain);
    grainChain = null;
  }
}

function scanForMediaElements(): void {
  if (usingTabCapture) return;
  const elements = document.querySelectorAll<HTMLMediaElement>('video, audio');
  console.log(TAG, 'Scan found', elements.length, 'media element(s)');
  elements.forEach(hookMediaElement);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Tier 2 must be installed before Tier 1 scans (and before any site scripts connect nodes)
installWebAudioPatch();

// Watch for dynamically added media elements (YouTube is a SPA)
const observer = new MutationObserver(() => scanForMediaElements());
observer.observe(document.documentElement, { childList: true, subtree: true });

// Tier 1 initial scan
scanForMediaElements();

// ─── Message handler ──────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent<MfarPostMessage>) => {
  if (event.source !== window) return;
  if (event.data?.direction !== 'mfar-to-main') return;

  const msg = event.data.payload as ContentMessage;
  console.log(TAG, 'Received message:', msg.type, msg);

  if (msg.type === 'SET_STATE') {
    isEnabled = msg.enabled;
    cutoffHz = msg.cutoff ?? cutoffHz;

    if (filterNode && gainNode && audioContext) {
      const now = audioContext.currentTime;
      setAudioParam(filterNode.frequency, isEnabled ? cutoffHz : WALL_BYPASS_HZ, now);
      setAudioParam(gainNode.gain, isEnabled ? WALL_GAIN_ON : WALL_GAIN_OFF, now);
    }

    scanForMediaElements();
  }

  if (msg.type === 'SET_CUTOFF') {
    cutoffHz = msg.cutoff;
    if (filterNode && isEnabled && audioContext) {
      setAudioParam(filterNode.frequency, cutoffHz, audioContext.currentTime);
    }
  }

  if (msg.type === 'SET_GRAIN') {
    grainEnabled = msg.enabled;
    applyGrain();
  }
});

console.log(TAG, 'Loaded in MAIN world — Tier 1 (media element hook) + Tier 2 (AudioNode patch) ready');
