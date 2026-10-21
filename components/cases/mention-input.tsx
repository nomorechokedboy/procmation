"use client";

import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { Bound } from "@/components/ui/bound";
import { Textarea } from "@/components/ui/textarea";
import type { CaseViewerRecord } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

export type Mention = { id: string; name: string };

// "@Al" right before the caret, at the start or after a space
const OPEN_MENTION = /(^|\s)@([^\s@]*)$/;
const MAX_SUGGESTIONS = 6;

// Keeps the people whose "@Name" is still in the text
export function mentionsIn(body: string, mentions: Mention[]): string[] {
  return mentions
    .filter((person) => body.includes(`@${person.name}`))
    .map((person) => person.id);
}

type MentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  mentions: Mention[];
  onMentionsChange: (mentions: Mention[]) => void;
  // People who can see the case, minus the writer
  people: CaseViewerRecord[];
  disabled?: boolean;
  testId?: string;
};

// A text box that offers people who can see the case once you type "@"
export function MentionInput({
  value,
  onChange,
  mentions,
  onMentionsChange,
  people,
  disabled,
  testId,
}: MentionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value;
      onChange(next);
      const beforeCaret = next.slice(0, event.target.selectionStart);
      const open = OPEN_MENTION.exec(beforeCaret);
      setQuery(open ? open[2] : null);
    },
    [onChange]
  );

  const pick = useCallback(
    (person: CaseViewerRecord) => {
      const caret = ref.current?.selectionStart ?? value.length;
      const before = value.slice(0, caret).replace(OPEN_MENTION, "$1");
      const after = value.slice(caret);
      onChange(`${before}@${person.name} ${after}`);
      if (!mentions.some((item) => item.id === person.id)) {
        onMentionsChange([...mentions, person]);
      }
      setQuery(null);
      ref.current?.focus();
    },
    [mentions, onChange, onMentionsChange, value]
  );

  const matches =
    query === null
      ? []
      : people
          .filter((person) =>
            person.name.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, MAX_SUGGESTIONS);

  return (
    <div className="relative">
      <Textarea
        data-testid={testId}
        disabled={disabled}
        onChange={handleChange}
        placeholder={m.comments_placeholder()}
        ref={ref}
        value={value}
      />
      {query === null ? null : (
        <div
          className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border bg-popover shadow-md"
          data-testid="mention-list"
        >
          {matches.length === 0 ? (
            <p className="p-2 text-muted-foreground text-xs">
              {m.comments_no_match()}
            </p>
          ) : (
            matches.map((person) => (
              <Bound args={[person]} fn={pick} key={person.id}>
                {(onClick) => (
                  <button
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                    data-testid="mention-option"
                    onClick={onClick}
                    onMouseDown={preventBlur}
                    type="button"
                  >
                    {person.name}
                  </button>
                )}
              </Bound>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Keeps the caret in the text box while an option is clicked
function preventBlur(event: { preventDefault: () => void }) {
  event.preventDefault();
}
