"use client";

import { type ChangeEvent, useCallback } from "react";
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
import { useStableCallback } from "@/hooks/use-stable-callback";
import type { FormField, FormValues } from "@/lib/types/process-form";

const TEXTAREA_CLASS =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

type FieldValue = FormValues[string] | undefined;

type FieldInputProps = {
  field: FormField;
  value: FieldValue;
  disabled: boolean;
  idPrefix: string;
  onChange: (key: string, value: FormValues[string]) => void;
};

function FieldInput({
  field,
  value,
  disabled,
  idPrefix,
  onChange,
}: FieldInputProps) {
  const id = `${idPrefix}-${field.key}`;

  const handleText = useStableCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(field.key, event.target.value)
  );
  const handleNumber = useStableCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      onChange(field.key, raw === "" ? null : Number(raw));
    }
  );
  const handleSelect = useStableCallback((next: string) =>
    onChange(field.key, next)
  );
  const handleCheckbox = useStableCallback(
    (checked: boolean | "indeterminate") =>
      onChange(field.key, checked === true)
  );

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          className={TEXTAREA_CLASS}
          disabled={disabled}
          id={id}
          onChange={handleText}
          value={typeof value === "string" ? value : ""}
        />
      );
    case "number":
      return (
        <Input
          disabled={disabled}
          id={id}
          onChange={handleNumber}
          type="number"
          value={typeof value === "number" ? value : ""}
        />
      );
    case "date":
      return (
        <Input
          disabled={disabled}
          id={id}
          onChange={handleText}
          type="date"
          value={typeof value === "string" ? value : ""}
        />
      );
    case "select":
      return (
        <Select
          disabled={disabled}
          onValueChange={handleSelect}
          value={typeof value === "string" ? value : ""}
        >
          <SelectTrigger className="w-full" id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "checkbox":
      return (
        <Checkbox
          checked={value === true}
          disabled={disabled}
          id={id}
          onCheckedChange={handleCheckbox}
        />
      );
    default:
      return (
        <Input
          disabled={disabled}
          id={id}
          onChange={handleText}
          value={typeof value === "string" ? value : ""}
        />
      );
  }
}

type DynamicFormProps = {
  fields: FormField[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  disabled?: boolean;
  idPrefix?: string;
};

/**
 * Renders the fields of a start form or a task form and reports the answers
 * as a plain values object keyed by field key.
 */
export function DynamicForm({
  fields,
  values,
  onChange,
  disabled = false,
  idPrefix = "field",
}: DynamicFormProps) {
  const handleFieldChange = useCallback(
    (key: string, value: FormValues[string]) =>
      onChange({ ...values, [key]: value }),
    [onChange, values]
  );

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div
          className={
            field.type === "checkbox"
              ? "flex flex-row-reverse items-center justify-end gap-2"
              : "space-y-2"
          }
          key={field.key}
        >
          <Label htmlFor={`${idPrefix}-${field.key}`}>
            {field.label}
            {field.required ? (
              <span className="text-destructive"> *</span>
            ) : null}
          </Label>
          <FieldInput
            disabled={disabled}
            field={field}
            idPrefix={idPrefix}
            onChange={handleFieldChange}
            value={values[field.key]}
          />
          {field.helpText ? (
            <p className="basis-full text-muted-foreground text-xs">
              {field.helpText}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
