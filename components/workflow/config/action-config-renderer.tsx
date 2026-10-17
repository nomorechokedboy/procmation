"use client";

import { ChevronDown } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TemplateBadgeInput } from "@/components/ui/template-badge-input";
import { TemplateBadgeTextarea } from "@/components/ui/template-badge-textarea";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  type ActionConfigField,
  type ActionConfigFieldBase,
  isFieldGroup,
} from "@/plugins";
import { SchemaBuilder, type SchemaField } from "./schema-builder";

type FieldProps = {
  field: ActionConfigFieldBase;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};

function TemplateInputField({ field, value, onChange, disabled }: FieldProps) {
  return (
    <TemplateBadgeInput
      disabled={disabled}
      id={field.key}
      onChange={onChange}
      placeholder={field.placeholder}
      value={value}
    />
  );
}

function TemplateTextareaField({
  field,
  value,
  onChange,
  disabled,
}: FieldProps) {
  return (
    <TemplateBadgeTextarea
      disabled={disabled}
      id={field.key}
      onChange={onChange}
      placeholder={field.placeholder}
      rows={field.rows || 4}
      value={value}
    />
  );
}

function TextInputField({ field, value, onChange, disabled }: FieldProps) {
  const handleOnChangeH1 = useStableCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)
  );
  return (
    <Input
      disabled={disabled}
      id={field.key}
      onChange={handleOnChangeH1}
      placeholder={field.placeholder}
      value={value}
    />
  );
}

function NumberInputField({ field, value, onChange, disabled }: FieldProps) {
  const handleOnChangeH2 = useStableCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)
  );
  return (
    <Input
      disabled={disabled}
      id={field.key}
      min={field.min}
      onChange={handleOnChangeH2}
      placeholder={field.placeholder}
      type="number"
      value={value}
    />
  );
}

function SelectField({ field, value, onChange, disabled }: FieldProps) {
  if (!field.options) {
    return null;
  }

  return (
    <Select disabled={disabled} onValueChange={onChange} value={value}>
      <SelectTrigger className="w-full" id={field.key}>
        <SelectValue placeholder={field.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {field.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SchemaBuilderField(props: FieldProps) {
  const handleOnChangeH3 = useStableCallback((schema) =>
    props.onChange(JSON.stringify(schema))
  );
  return (
    <SchemaBuilder
      disabled={props.disabled}
      onChange={handleOnChangeH3}
      schema={props.value ? (JSON.parse(props.value) as SchemaField[]) : []}
    />
  );
}

const FIELD_RENDERERS: Record<
  ActionConfigFieldBase["type"],
  React.ComponentType<FieldProps>
> = {
  number: NumberInputField,
  "schema-builder": SchemaBuilderField,
  select: SelectField,
  "template-input": TemplateInputField,
  "template-textarea": TemplateTextareaField,
  text: TextInputField,
};

/**
 * Renders a single base field
 */
function FieldRow({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const handleOnChangeH4 = useStableCallback((val: unknown) =>
    onUpdateConfig(field.key, val)
  );
  // Check conditional rendering
  if (field.showWhen) {
    const dependentValue = config[field.showWhen.field];
    if (dependentValue !== field.showWhen.equals) {
      return null;
    }
  }

  const value =
    (config[field.key] as string | undefined) || field.defaultValue || "";
  const FieldRenderer = FIELD_RENDERERS[field.type];

  return (
    <div className="space-y-2" key={field.key}>
      <Label className="ml-1" htmlFor={field.key}>
        {field.label}
        {field.required ? <span className="text-red-500">*</span> : null}
      </Label>
      <FieldRenderer
        disabled={disabled}
        field={field}
        onChange={handleOnChangeH4}
        value={value}
      />
    </div>
  );
}

/**
 * Collapsible field group component
 */
function FieldGroup({
  label,
  fields,
  config,
  onUpdateConfig,
  disabled,
  defaultExpanded = false,
}: {
  label: string;
  fields: ActionConfigFieldBase[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}) {
  const handleOnClickH5 = useStableCallback(() => setIsExpanded(!isExpanded));
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-2">
      <button
        className="ml-1 flex items-center gap-1 text-left"
        onClick={handleOnClickH5}
        type="button"
      >
        <span className="font-medium text-sm">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
      </button>
      {isExpanded ? (
        <div className="ml-1 space-y-4 border-primary/50 border-l-2 py-2 pl-3">
          {fields.map((field) => (
            <FieldRow
              config={config}
              disabled={disabled}
              field={field}
              key={field.key}
              onUpdateConfig={onUpdateConfig}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ActionConfigRendererProps = {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
};

/**
 * Renders action config fields declaratively
 * Converts ActionConfigField definitions into actual UI components
 */
export function ActionConfigRenderer({
  fields,
  config,
  onUpdateConfig,
  disabled,
}: ActionConfigRendererProps) {
  return (
    <>
      {fields.map((field) => {
        if (isFieldGroup(field)) {
          return (
            <FieldGroup
              config={config}
              defaultExpanded={field.defaultExpanded}
              disabled={disabled}
              fields={field.fields}
              key={`group-${field.label}`}
              label={field.label}
              onUpdateConfig={onUpdateConfig}
            />
          );
        }

        return (
          <FieldRow
            config={config}
            disabled={disabled}
            field={field}
            key={field.key}
            onUpdateConfig={onUpdateConfig}
          />
        );
      })}
    </>
  );
}
