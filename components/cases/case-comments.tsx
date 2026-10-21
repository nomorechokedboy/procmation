"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type Mention,
  MentionInput,
  mentionsIn,
} from "@/components/cases/mention-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  api,
  type CaseViewerRecord,
  type CommentRecord,
} from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

// The comment text with each "@Name" that was really a mention picked out
function CommentBody({ comment }: { comment: CommentRecord }) {
  const parts = useMemo(() => {
    if (comment.mentions.length === 0) {
      return [comment.body];
    }
    const names = comment.mentions
      .map((person) => `@${person.name}`.replace(REGEX_SPECIALS, "\\$&"))
      .join("|");
    return comment.body.split(new RegExp(`(${names})`));
  }, [comment]);

  return (
    <p className="whitespace-pre-wrap text-sm">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
          <span className="font-medium text-primary" key={index}>
            {part}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </p>
  );
}

type CommentItemProps = {
  caseId: string;
  comment: CommentRecord;
  people: CaseViewerRecord[];
  canDelete: boolean;
  canEdit: boolean;
  onChanged: () => void;
};

function CommentItem({
  caseId,
  comment,
  people,
  canDelete,
  canEdit,
  onChanged,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  const [mentions, setMentions] = useState<Mention[]>(comment.mentions);
  const [busy, setBusy] = useState(false);

  const startEdit = useCallback(() => {
    setText(comment.body);
    setMentions(comment.mentions);
    setEditing(true);
  }, [comment]);
  const stopEdit = useCallback(() => setEditing(false), []);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await api.comment.update(caseId, comment.id, {
        body: text,
        mentions: mentionsIn(text, mentions),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.comments_update_failed()
      );
    } finally {
      setBusy(false);
    }
  }, [caseId, comment.id, mentions, onChanged, text]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await api.comment.delete(caseId, comment.id);
      toast.success(m.comments_deleted());
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.comments_delete_failed()
      );
      setBusy(false);
    }
  }, [caseId, comment.id, onChanged]);

  const edited = comment.updatedAt !== comment.createdAt;

  return (
    <div className="space-y-1 py-3" data-testid="comment">
      <p className="text-muted-foreground text-xs">
        <span className="font-medium text-foreground">
          {comment.authorName}
        </span>
        {" · "}
        {new Date(comment.createdAt).toLocaleString(getLocale(), {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        {edited ? ` · ${m.comments_edited()}` : ""}
      </p>
      {editing ? (
        <div className="space-y-2">
          <MentionInput
            mentions={mentions}
            onChange={setText}
            onMentionsChange={setMentions}
            people={people}
            testId="comment-edit-input"
            value={text}
          />
          <div className="flex gap-2">
            <Button
              data-testid="comment-save"
              disabled={busy || !text.trim()}
              onClick={save}
              size="sm"
            >
              {m.comments_save()}
            </Button>
            <Button onClick={stopEdit} size="sm" variant="outline">
              {m.comments_cancel()}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <CommentBody comment={comment} />
          {canEdit || canDelete ? (
            <div className="flex gap-3 text-xs">
              {canEdit ? (
                <button
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  data-testid="comment-edit"
                  onClick={startEdit}
                  type="button"
                >
                  {m.comments_edit()}
                </button>
              ) : null}
              {canDelete ? (
                <button
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  data-testid="comment-delete"
                  disabled={busy}
                  onClick={remove}
                  type="button"
                >
                  {m.comments_delete()}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// Comments on a case, newest at the bottom, with @mentions limited to people
// who can see the case
export function CaseComments({ caseId }: { caseId: string }) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [people, setPeople] = useState<CaseViewerRecord[]>([]);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments(await api.comment.list(caseId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.load_failed());
    }
  }, [caseId]);

  useEffect(() => {
    load();
    api.comment
      .viewers(caseId)
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [caseId, load]);

  const post = useCallback(async () => {
    setPosting(true);
    try {
      await api.comment.create(caseId, {
        body: text,
        mentions: mentionsIn(text, mentions),
      });
      setText("");
      setMentions([]);
      toast.success(m.comments_posted());
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.comments_post_failed()
      );
    } finally {
      setPosting(false);
    }
  }, [caseId, load, mentions, text]);

  const me = session?.user;
  const others = people.filter((person) => person.id !== me?.id);
  const isAdmin = me?.role === "admin";

  return (
    <Card data-testid="case-comments">
      <CardHeader>
        <CardTitle>{m.comments_title()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y">
          {comments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {m.comments_empty()}
            </p>
          ) : null}
          {comments.map((comment) => (
            <CommentItem
              canDelete={isAdmin || comment.authorId === me?.id}
              canEdit={comment.authorId === me?.id}
              caseId={caseId}
              comment={comment}
              key={comment.id}
              onChanged={load}
              people={others}
            />
          ))}
        </div>
        <div className="space-y-2">
          <MentionInput
            disabled={posting}
            mentions={mentions}
            onChange={setText}
            onMentionsChange={setMentions}
            people={others}
            testId="comment-input"
            value={text}
          />
          <Button
            data-testid="comment-post"
            disabled={posting || !text.trim()}
            onClick={post}
            size="sm"
          >
            {m.comments_post()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
