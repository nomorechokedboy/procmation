"use client";

import { useEffect, useState } from "react";
import { api, type Me } from "@/lib/api-client";
import type { Permission } from "@/lib/permissions";

type State = { me: Me | null; loaded: boolean };

// Who is signed in and what they may do. `can` is false until it is known, so
// a page never flashes something the person cannot use.
export function usePermissions() {
  const [state, setState] = useState<State>({ loaded: false, me: null });

  useEffect(() => {
    api.me
      .get()
      .then((me) => setState({ loaded: true, me }))
      .catch(() => setState({ loaded: true, me: null }));
  }, []);

  const granted = state.me?.permissions ?? [];
  return {
    can: (permission: Permission) => granted.includes(permission),
    loaded: state.loaded,
    me: state.me,
  };
}
