"use client";

import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";

// biome-ignore lint/suspicious/noExplicitAny: generic over any handler signature
type AnyFn = (...args: any[]) => any;

type RestArgs<Fn extends AnyFn, Bound extends unknown[]> =
  Parameters<Fn> extends [...Bound, ...infer Rest] ? Rest : never;

type BoundProps<Fn extends AnyFn, Args extends unknown[] | []> = {
  /** Values bound as the leading arguments of `fn`. */
  args: Args;
  /** Handler receiving the bound arguments followed by the event arguments. */
  fn: Fn;
  /** Render prop receiving a handler whose identity never changes. */
  children: (
    handler: (...rest: RestArgs<Fn, Args>) => ReturnType<Fn>
  ) => ReactNode;
};

/**
 * Binds leading arguments to a handler for use inside list rows, so the
 * handler passed to the row's JSX props keeps a stable identity instead of
 * being a fresh inline arrow on every render.
 */
export function Bound<Fn extends AnyFn, Args extends unknown[] | []>({
  args,
  fn,
  children,
}: BoundProps<Fn, Args>) {
  const latest = useRef({ args, fn });
  useLayoutEffect(() => {
    latest.current = { args, fn };
  });
  const handler = useCallback((...rest: RestArgs<Fn, Args>) => {
    const current = latest.current;
    return current.fn(...current.args, ...rest);
  }, []);
  return <>{children(handler)}</>;
}
