// ─── Wall filter constants ────────────────────────────────────────────────────

export const WALL_Q = 0.8;
export const WALL_BYPASS_HZ = 20000;
export const WALL_GAIN_ON = 0.65;
export const WALL_GAIN_OFF = 1.0;
export const WALL_TIME_CONSTANT = 0.05;

// ─── Grain constants + chain ──────────────────────────────────────────────────

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

// ─── Wall chain ───────────────────────────────────────────────────────────────

export function buildWallChain(
  ctx: AudioContext,
  source: AudioNode,
  wallEnabled: boolean,
  wallCutoff: number
): { wallFilterNode: BiquadFilterNode; wallGainNode: GainNode } {
  const wallFilterNode = ctx.createBiquadFilter();
  wallFilterNode.type = 'lowpass';
  wallFilterNode.frequency.value = wallEnabled ? wallCutoff : WALL_BYPASS_HZ;
  wallFilterNode.Q.value = WALL_Q;

  const wallGainNode = ctx.createGain();
  wallGainNode.gain.value = wallEnabled ? WALL_GAIN_ON : WALL_GAIN_OFF;

  source.connect(wallFilterNode);
  wallFilterNode.connect(wallGainNode);
  wallGainNode.connect(ctx.destination);

  return { wallFilterNode, wallGainNode };
}

export function setAudioParam(param: AudioParam, value: number, currentTime: number): void {
  param.cancelScheduledValues(currentTime);
  param.setTargetAtTime(value, currentTime, WALL_TIME_CONSTANT);
}
