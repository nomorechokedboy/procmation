import "server-only";

import { AUDIT_RESOURCES, type AuditEntry } from "@/lib/audit";
import type { Attachment, Case } from "@/lib/db/schema";

const MAX_FILENAME_LENGTH = 200;
const LEADING_DOTS = /^\.+/;
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

// Path separators and control characters become underscores
function isUnsafe(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    character === "/" ||
    character === "\\" ||
    code <= LAST_CONTROL_CODE ||
    code === DELETE_CODE
  );
}
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const CONTENT_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

// A name that is safe to show and to put in a header
export function cleanFilename(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = [...value]
    .map((character) => (isUnsafe(character) ? "_" : character))
    .join("")
    .trim();
  const trimmed = name.slice(-MAX_FILENAME_LENGTH).replace(LEADING_DOTS, "");
  return trimmed || null;
}

export function cleanContentType(value: unknown): string {
  return typeof value === "string" && CONTENT_TYPE_PATTERN.test(value)
    ? value.toLowerCase()
    : DEFAULT_CONTENT_TYPE;
}

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
};

export function toAttachmentView(
  row: Attachment,
  uploaderName: string
): AttachmentView {
  return {
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    size: row.size,
    uploadedById: row.uploadedById,
    uploadedByName: uploaderName,
  };
}

export function attachmentAudit(input: {
  action: "uploaded" | "deleted";
  actor: { id: string; name: string };
  attachment: Attachment;
  record: Case | null;
  // Whose file it was, when someone else removed it
  ownerName?: string;
}): AuditEntry {
  const { actor, attachment, record } = input;
  const verb = input.action === "uploaded" ? "attached" : "removed";
  const where = record ? ` on ${record.caseNumber}` : "";
  const owner = input.ownerName ? ` (uploaded by ${input.ownerName})` : "";
  return {
    action: input.action,
    actor,
    metadata: { size: attachment.size },
    parent: record
      ? { id: record.id, label: record.caseNumber, type: "case" }
      : undefined,
    resourceId: attachment.id,
    resourceLabel: attachment.filename,
    resourceType: AUDIT_RESOURCES.attachment,
    summary: `${actor.name} ${verb} "${attachment.filename}"${where}${owner}`,
  };
}
