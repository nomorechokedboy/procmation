import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Returns a function with a stable identity that always calls the latest
 * `callback`. Use it for event handlers passed as JSX props so they do not
 * change on every render and do not need a dependency list.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic over any handler signature
export function useStableCallback<Args extends any[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
