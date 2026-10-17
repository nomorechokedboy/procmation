"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugifyFieldKey } from "@/lib/process-form-validation";
import type { FormField, FormFieldType } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";

const FIELD_TYPES: FormFieldType[] = [
  "checkbox",
  "date",
  "number",
  "select",
  "text",
  "textarea",
];

function typeLabel(type: FormFieldType): string {
  switch (type) {
    case "checkbox":
      return m.form_fields_type_checkbox();
    case "date":
      return m.form_fields_type_date();
    case "number":
      return m.form_fields_type_number();
    case "select":
      return m.form_fields_type_select();
    case "text":
      return m.form_fields_type_text();
    default:
      return m.form_fields_type_textarea();
  }
}

type Row = {
  uid: number;
  field: FormField;
  // Keys of existing fields stay fixed so renaming a label never changes the
  // key that submitted data is stored under
  keyLocked: boolean;
};

type FormFieldsEditorProps = {
  initialFields: FormField[];
  onChange: (fields: FormField[]) => void;
};

const FIELD_PREFIX_REGEX = /^field_/;

function parseOptions(text: string): { label: string; value: string }[] {
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const part of text.split(",")) {
    const label = part.trim();
    if (!label) {
      continue;
    }
    let value =
      slugifyFieldKey(label).replace(FIELD_PREFIX_REGEX, "") || "option";
    let suffix = 2;
    while (seen.has(value)) {
      value = `${value}_${suffix}`;
      suffix += 1;
    }
    seen.add(value);
    options.push({ label, value });
  }
  return options;
}

function uniqueKey(base: string, rows: Row[], selfUid: number): string {
  const taken = new Set(
    rows.filter((row) => row.uid !== selfUid).map((row) => row.field.key)
  );
  let key = base || "field";
  let suffix = 2;
  while (taken.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function OptionsInput({
  options,
  onChange,
}: {
  options: { label: string; value: string }[];
  onChange: (options: { label: string; value: string }[]) => void;
}) {
  // Keep the raw text so typing a trailing comma is not swallowed
  const [text, setText] = useState(
    options.map((option) => option.label).join(", ")
  );

  return (
    <Input
      aria-label={m.form_fields_options_label()}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseOptions(event.target.value));
      }}
      placeholder={m.form_fields_options_placeholder()}
      value={text}
    />
  );
}

export function FormFieldsEditor({
  initialFields,
  onChange,
}: FormFieldsEditorProps) {
  const [nextUid, setNextUid] = useState(initialFields.length);
  const [rows, setRows] = useState<Row[]>(
    initialFields.map((field, index) => ({
      field,
      keyLocked: true,
      uid: index,
    }))
  );

  const commit = (updated: Row[]) => {
    setRows(updated);
    onChange(updated.map((row) => row.field));
  };

  const updateField = (uid: number, changes: Partial<FormField>) => {
    commit(
      rows.map((row) => {
        if (row.uid !== uid) {
          return row;
        }
        const field = { ...row.field, ...changes };
        if (changes.type && changes.type !== "select") {
          field.options = undefined;
        }
        if (changes.type === "select" && !field.options) {
          field.options = [];
        }
        return { ...row, field };
      })
    );
  };

  const handleLabelChange = (row: Row, label: string) => {
    const key = row.keyLocked
      ? row.field.key
      : uniqueKey(slugifyFieldKey(label), rows, row.uid);
    commit(
      rows.map((item) =>
        item.uid === row.uid
          ? { ...item, field: { ...item.field, key, label } }
          : item
      )
    );
  };

  const addField = () => {
    commit([
      ...rows,
      {
        field: {
          key: uniqueKey("field", rows, nextUid),
          label: "",
          type: "text",
        },
        keyLocked: false,
        uid: nextUid,
      },
    ]);
    setNextUid(nextUid + 1);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) {
      return;
    }
    const updated = [...rows];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    commit(updated);
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.form_fields_empty()}</p>
      ) : null}

      {rows.map((row, index) => (
        <div className="space-y-2 rounded-md border p-3" key={row.uid}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={m.form_fields_label_aria()}
              className="min-w-40 flex-1"
              onChange={(event) => handleLabelChange(row, event.target.value)}
              placeholder={m.form_fields_label_placeholder()}
              value={row.field.label}
            />
            <Select
              onValueChange={(type) =>
                updateField(row.uid, { type: type as FormFieldType })
              }
              value={row.field.type}
            >
              <SelectTrigger
                aria-label={m.form_fields_type_aria()}
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {typeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={row.field.required === true}
                id={`required-${row.uid}`}
                onCheckedChange={(checked) =>
                  updateField(row.uid, { required: checked === true })
                }
              />
              <Label className="text-sm" htmlFor={`required-${row.uid}`}>
                {m.form_fields_required()}
              </Label>
            </div>
            <div className="flex">
              <Button
                aria-label={m.form_fields_move_up()}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                aria-label={m.form_fields_move_down()}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                aria-label={m.form_fields_remove()}
                onClick={() =>
                  commit(rows.filter((item) => item.uid !== row.uid))
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {row.field.type === "select" ? (
            <OptionsInput
              onChange={(options) => updateField(row.uid, { options })}
              options={row.field.options ?? []}
            />
          ) : null}

          <p className="text-muted-foreground text-xs">
            {m.form_fields_key({ key: row.field.key })}
          </p>
        </div>
      ))}

      <Button onClick={addField} size="sm" type="button" variant="outline">
        <Plus className="size-4" />
        {m.form_fields_add()}
      </Button>
    </div>
  );
}
