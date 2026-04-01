import type { OffscreenMessage, StartCaptureMessage, UpdateFilterMessage, StopCaptureMessage } from '../types';
import { buildFilterChain, setAudioParam } from '../filter-chain';

const TAG = '[MFAR:offscreen]';

interface CaptureState {
  stream: MediaStream;
  ctx: AudioContext;
  filterNode: BiquadFilterNode;
  gainNode: GainNode;
}

const captures = new Map<number, CaptureState>();

chrome.runtime.onMessage.addListener((msg: OffscreenMessage) => {
  if (msg.type === 'MFAR_START_CAPTURE') handleStart(msg);
  if (msg.type === 'MFAR_UPDATE_FILTER') handleUpdate(msg);
  if (msg.type === 'MFAR_STOP_CAPTURE') handleStop(msg);
});

async function handleStart({ streamId, tabId, cutoff, enabled }: StartCaptureMessage): Promise<void> {
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

    captures.set(tabId, { stream, ctx, filterNode, gainNode });
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

function handleStop({ tabId }: StopCaptureMessage): void {
  const cap = captures.get(tabId);
  if (!cap) return;

  cap.stream.getTracks().forEach((t) => t.stop());
  cap.ctx.close();
  captures.delete(tabId);
  console.log(TAG, 'Capture stopped for tab', tabId);
}
