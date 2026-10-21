"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AttachmentRecord, api } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { formatSize } from "@/lib/format-size";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const BYTES_PER_MB = 1024 * 1024;

// Files on a case. Hidden when the server has no storage set up.
export function CaseAttachments({
  caseId,
  readOnly = false,
}: {
  caseId: string;
  readOnly?: boolean;
}) {
  const { data: session } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [maxBytes, setMaxBytes] = useState(0);
  const [files, setFiles] = useState<AttachmentRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFiles(await api.attachment.listForCase(caseId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.load_failed());
    }
  }, [caseId]);

  useEffect(() => {
    api.attachment
      .config()
      .then((settings) => {
        setEnabled(settings.enabled);
        setMaxBytes(settings.maxBytes);
        if (settings.enabled) {
          load();
        }
      })
      .catch(() => setEnabled(false));
  }, [load]);

  const choose = useCallback(() => input.current?.click(), []);

  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      if (file.size > maxBytes) {
        toast.error(
          m.attachments_too_big({ mb: Math.floor(maxBytes / BYTES_PER_MB) })
        );
        return;
      }
      setBusy(true);
      try {
        await api.attachment.upload(file, caseId);
        toast.success(m.attachments_uploaded());
        await load();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.attachments_upload_failed()
        );
      } finally {
        setBusy(false);
      }
    },
    [caseId, load, maxBytes]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.attachment.delete(id);
        toast.success(m.attachments_removed());
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.attachments_remove_failed()
        );
      }
      await load();
    },
    [load]
  );

  if (!enabled) {
    return null;
  }
  const me = session?.user;

  return (
    <Card data-testid="case-attachments">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{m.attachments_title()}</CardTitle>
        {readOnly ? null : (
          <>
            <Button
              data-testid="attach-file"
              disabled={busy}
              onClick={choose}
              size="sm"
              variant="outline"
            >
              {m.attachments_add()}
            </Button>
            <input
              className="hidden"
              data-testid="attach-input"
              onChange={handleFile}
              ref={input}
              type="file"
            />
          </>
        )}
      </CardHeader>
      <CardContent className="divide-y">
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {m.attachments_empty()}
          </p>
        ) : null}
        {files.map((file) => (
          <div
            className="flex items-center justify-between gap-3 py-2"
            data-testid="attachment"
            key={file.id}
          >
            <div className="min-w-0">
              <a
                className="block truncate font-medium text-sm underline-offset-2 hover:underline"
                href={api.attachment.downloadUrl(file.id)}
              >
                {file.filename}
              </a>
              <p className="text-muted-foreground text-xs">
                {formatSize(file.size)} ·{" "}
                {m.attachments_by({
                  date: new Date(file.createdAt).toLocaleDateString(
                    getLocale()
                  ),
                  name: file.uploadedByName,
                })}
              </p>
            </div>
            {!readOnly &&
            (file.uploadedById === me?.id || me?.role === "admin") ? (
              <Bound args={[file.id]} fn={remove}>
                {(onClick) => (
                  <Button
                    data-testid="attachment-remove"
                    onClick={onClick}
                    size="sm"
                    variant="outline"
                  >
                    {m.attachments_remove()}
                  </Button>
                )}
              </Bound>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
