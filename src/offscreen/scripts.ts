import type { OffscreenMessage, StartCaptureMessage, UpdateFilterMessage, UpdateGrainMessage, StopCaptureMessage } from '../types';
import { buildFilterChain, setAudioParam, buildGrainChain, teardownGrainChain, type GrainChain } from '../filter-chain';

const TAG = '[MFAR:offscreen]';

interface CaptureState {
  stream: MediaStream;
  ctx: AudioContext;
  filterNode: BiquadFilterNode;
  gainNode: GainNode;
  grainChain: GrainChain | null;
}

const captures = new Map<number, CaptureState>();

chrome.runtime.onMessage.addListener((msg: OffscreenMessage) => {
  if (msg.type === 'MFAR_START_CAPTURE') handleStart(msg);
  if (msg.type === 'MFAR_UPDATE_FILTER') handleUpdate(msg);
  if (msg.type === 'MFAR_UPDATE_GRAIN') handleGrain(msg);
  if (msg.type === 'MFAR_STOP_CAPTURE') handleStop(msg);
});

async function handleStart({ streamId, tabId, cutoff, enabled, grainEnabled }: StartCaptureMessage): Promise<void> {
  handleStop({ type: 'MFAR_STOP_CAPTURE', tabId });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints,
    });

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const { filterNode, gainNode } = buildFilterChain(ctx, source, enabled, cutoff);
    const grainChain = grainEnabled ? buildGrainChain(ctx) : null;

    captures.set(tabId, { stream, ctx, filterNode, gainNode, grainChain });
    console.log(TAG, 'Capture started for tab', tabId, '— filter:', filterNode.frequency.value, 'Hz');
  } catch (err) {
    console.error(TAG, 'Failed to start capture:', err);
  }
}

function handleUpdate({ tabId, cutoff }: UpdateFilterMessage): void {
  const cap = captures.get(tabId);
  if (!cap) return;

  setAudioParam(cap.filterNode.frequency, cutoff, cap.ctx.currentTime);
  console.log(TAG, 'Filter updated for tab', tabId, '— cutoff:', cutoff);
}

function handleGrain({ tabId, enabled }: UpdateGrainMessage): void {
  const cap = captures.get(tabId);
  if (!cap) return;

  if (enabled && !cap.grainChain) {
    cap.grainChain = buildGrainChain(cap.ctx);
  } else if (!enabled && cap.grainChain) {
    teardownGrainChain(cap.grainChain);
    cap.grainChain = null;
  }
}

function handleStop({ tabId }: StopCaptureMessage): void {
  const cap = captures.get(tabId);
  if (!cap) return;

  if (cap.grainChain) teardownGrainChain(cap.grainChain);
  cap.stream.getTracks().forEach((t) => t.stop());
  cap.ctx.close();
  captures.delete(tabId);
  console.log(TAG, 'Capture stopped for tab', tabId);
}
