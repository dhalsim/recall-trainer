import { createSignal } from 'solid-js';

const [amberLoginFlowActive, setAmberLoginFlowActiveSignal] = createSignal(false);

export function isAmberLoginFlowActive(): boolean {
  return amberLoginFlowActive();
}

export function setAmberLoginFlowActive(active: boolean): void {
  setAmberLoginFlowActiveSignal(active);
}
