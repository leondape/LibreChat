import { createContext, useRef, useContext, RefObject, ReactNode } from 'react';
import { ThemeContext, isDark } from '@librechat/client';
import { completeProgressiveRowMounts } from '~/hooks/Messages/useProgressiveRowMount';
import { captureNode } from '~/utils/captureNode';

type ScreenshotContextType = {
  ref?: RefObject<HTMLDivElement>;
};

export { ScreenshotLimitError } from '~/utils/captureNode';

const ScreenshotContext = createContext<ScreenshotContextType>({});

export const useScreenshot = () => {
  const { ref } = useContext(ScreenshotContext);
  const { theme } = useContext(ThemeContext);

  const takeScreenShot = async (node?: HTMLElement): Promise<Blob> => {
    if (!node) {
      throw new Error('You should provide correct html node.');
    }
    return captureNode(node, isDark(theme));
  };

  const captureScreenshot = async (): Promise<Blob> => {
    if (ref instanceof Function) {
      throw new Error('Ref callback is not supported.');
    }
    /** A capture taken while a long thread is still progressively mounting
     *  would clone a truncated DOM; force the remaining rows in first. */
    await completeProgressiveRowMounts();
    if (ref?.current) {
      return takeScreenShot(ref.current);
    }
    throw new Error('Ref is not attached to any element.');
  };

  return { screenshotTargetRef: ref, captureScreenshot };
};

export const ScreenshotProvider = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);

  return <ScreenshotContext.Provider value={{ ref }}>{children}</ScreenshotContext.Provider>;
};
