import { useState } from 'react';
import { captureNode } from '~/utils/captureNode';
import { deliverImage } from './deliver';

export type ShareState = 'idle' | 'preparing' | 'done' | 'error';

const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Captures `node` and shares or downloads it. A dismissed share sheet is not an error. */
export function useShareImage(node: () => HTMLElement | null, filename: string) {
  const [state, setState] = useState<ShareState>('idle');

  const share = async () => {
    const target = node();
    if (!target) {
      setState('error');
      return;
    }
    setState('preparing');
    try {
      await deliverImage(await captureNode(target), filename);
      setState('done');
    } catch (error) {
      setState(cancelled(error) ? 'idle' : 'error');
    }
  };

  return { state, share };
}
