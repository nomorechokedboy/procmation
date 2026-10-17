import { type ChangeEvent, useCallback } from "react";

/**
 * A stable onChange handler that passes an input's text to a setter, so the
 * prop keeps the same identity across renders.
 */
export function useInputChange(setValue: (value: string) => void) {
  return useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(event.target.value);
    },
    [setValue]
  );
}
