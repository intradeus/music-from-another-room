/** @typedef {{ stream: MediaStream, ctx: AudioContext, filterNode: BiquadFilterNode, gainNode: GainNode }} CaptureState */

const TAG = '[MFAR:offscreen]';

/** @type {Map<number, CaptureState>} */
const captures = new Map();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'MFAR_START_CAPTURE') handleStart(msg);
  if (msg.type === 'MFAR_UPDATE_FILTER') handleUpdate(msg);
  if (msg.type === 'MFAR_STOP_CAPTURE') handleStop(msg);
});

async function handleStart({ streamId, tabId, cutoff, enabled }) {
  handleStop({ tabId });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);

    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = enabled ? cutoff : 20000;
    filterNode.Q.value = 0.8;

    const gainNode = ctx.createGain();
    gainNode.gain.value = enabled ? 0.65 : 1.0;

    source.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    captures.set(tabId, { stream, ctx, filterNode, gainNode });
    console.log(TAG, 'Capture started for tab', tabId, '— filter:', filterNode.frequency.value, 'Hz');
  } catch (err) {
    console.error(TAG, 'Failed to start capture:', err);
  }
}

function handleUpdate({ tabId, cutoff }) {
  const cap = captures.get(tabId);
  if (!cap) return;

  const now = cap.ctx.currentTime;
  cap.filterNode.frequency.cancelScheduledValues(now);
  cap.filterNode.frequency.setTargetAtTime(cutoff, now, 0.05);
  console.log(TAG, 'Filter updated for tab', tabId, '— cutoff:', cutoff);
}

function handleStop({ tabId }) {
  const cap = captures.get(tabId);
  if (!cap) return;

  cap.stream.getTracks().forEach((t) => t.stop());
  cap.ctx.close();
  captures.delete(tabId);
  console.log(TAG, 'Capture stopped for tab', tabId);
}
