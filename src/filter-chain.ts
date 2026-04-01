export const FILTER_Q = 0.8;
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
