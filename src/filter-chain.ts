export const FILTER_Q = 0.8;
export const GRAIN_BANDPASS_FREQ = 3500;
export const GRAIN_BANDPASS_Q = 0.8;
export const GRAIN_GAIN = 0.03;
export const GRAIN_BUFFER_SECS = 2;

export interface GrainChain {
  source: AudioBufferSourceNode;
  filterNode: BiquadFilterNode;
  gainNode: GainNode;
}

export function buildGrainChain(ctx: AudioContext): GrainChain {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * GRAIN_BUFFER_SECS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filterNode = ctx.createBiquadFilter();
  filterNode.type = 'bandpass';
  filterNode.frequency.value = GRAIN_BANDPASS_FREQ;
  filterNode.Q.value = GRAIN_BANDPASS_Q;

  const gainNode = ctx.createGain();
  gainNode.gain.value = GRAIN_GAIN;

  source.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
  return { source, filterNode, gainNode };
}

export function teardownGrainChain(grain: GrainChain): void {
  grain.source.stop();
  grain.source.disconnect();
  grain.filterNode.disconnect();
  grain.gainNode.disconnect();
}

export const GAIN_ENABLED = 0.65;
export const GAIN_DISABLED = 1.0;
export const FILTER_BYPASS_HZ = 20000;
export const FILTER_TIME_CONSTANT = 0.05;

export function buildFilterChain(
  ctx: AudioContext,
  source: AudioNode,
  enabled: boolean,
  cutoff: number
): { filterNode: BiquadFilterNode; gainNode: GainNode } {
  const filterNode = ctx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = enabled ? cutoff : FILTER_BYPASS_HZ;
  filterNode.Q.value = FILTER_Q;

  const gainNode = ctx.createGain();
  gainNode.gain.value = enabled ? GAIN_ENABLED : GAIN_DISABLED;

  source.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(ctx.destination);

  return { filterNode, gainNode };
}

export function setAudioParam(param: AudioParam, value: number, currentTime: number): void {
  param.cancelScheduledValues(currentTime);
  param.setTargetAtTime(value, currentTime, FILTER_TIME_CONSTANT);
}
