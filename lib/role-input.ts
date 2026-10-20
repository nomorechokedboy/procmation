import { isPermission, type Permission } from "@/lib/permissions";

const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 200;
const NON_KEY_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

export type RoleInput = {
  name: string;
  description: string | null;
  permissions: Permission[];
};

// "Process owner" -> "process-owner"
export function roleKeyFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(NON_KEY_CHARACTERS, "-")
    .replace(EDGE_DASHES, "");
}

type Parsed = { ok: true; value: RoleInput } | { ok: false; error: string };

// Checks what an admin sent when creating or editing a role
export function parseRoleInput(body: Record<string, unknown>): Parsed {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    return {
      error: `Name is required, up to ${MAX_NAME_LENGTH} characters`,
      ok: false,
    };
  }
  if (!roleKeyFromName(name)) {
    return { error: "Name needs letters or numbers", ok: false };
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      error: `Description can be up to ${MAX_DESCRIPTION_LENGTH} characters`,
      ok: false,
    };
  }

  const requested = Array.isArray(body.permissions) ? body.permissions : [];
  if (!requested.every(isPermission)) {
    return { error: "Unknown permission", ok: false };
  }

  return {
    ok: true,
    value: {
      description: description || null,
      name,
      permissions: [...new Set(requested)],
    },
  };
}
