"use client";

import { Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import type { ChangeEvent } from "react";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
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

export type SchemaField = {
  id?: string;
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  itemType?: "string" | "number" | "boolean" | "object";
  fields?: SchemaField[];
  description?: string;
};

type SchemaBuilderProps = {
  schema: SchemaField[];
  onChange: (schema: SchemaField[]) => void;
  disabled?: boolean;
  level?: number;
};

export function SchemaBuilder({
  schema,
  onChange,
  disabled,
  level = 0,
}: SchemaBuilderProps) {
  const addField = useStableCallback(() => {
    onChange([...schema, { id: nanoid(), name: "", type: "string" }]);
  });

  const resetDependentFields = (
    field: SchemaField,
    type: SchemaField["type"]
  ): SchemaField => {
    const updated = { ...field };

    if (type !== "array") {
      updated.itemType = undefined;
    }
    if (type !== "object") {
      updated.fields = undefined;
    }
    if (type === "array" && !updated.itemType) {
      updated.itemType = "string";
    }
    if (type === "object" && !updated.fields) {
      updated.fields = [];
    }

    return updated;
  };

  const updateField = useStableCallback(
    (index: number, updates: Partial<SchemaField>) => {
      const newSchema = [...schema];
      newSchema[index] = { ...newSchema[index], ...updates };

      // Reset dependent fields when type changes
      if (updates.type) {
        newSchema[index] = resetDependentFields(newSchema[index], updates.type);
      }

      onChange(newSchema);
    }
  );

  const removeField = useStableCallback((index: number) => {
    onChange(schema.filter((_, i) => i !== index));
  });

  const updateNestedFields = useStableCallback(
    (index: number, fields: SchemaField[]) => {
      const newSchema = [...schema];
      newSchema[index].fields = fields;
      onChange(newSchema);
    }
  );

  const changeName = useStableCallback(
    (index: number, event: ChangeEvent<HTMLInputElement>) =>
      updateField(index, { name: event.target.value })
  );
  const changeDescription = useStableCallback(
    (index: number, event: ChangeEvent<HTMLInputElement>) =>
      updateField(index, { description: event.target.value })
  );
  const changeType = useStableCallback((index: number, value: string) =>
    updateField(index, { type: value as SchemaField["type"] })
  );
  const changeItemType = useStableCallback((index: number, value: string) =>
    updateField(index, { itemType: value as SchemaField["itemType"] })
  );

  const indentClass = level > 0 ? "ml-4 border-l-2 border-muted pl-4" : "";

  return (
    <div className={`space-y-3 ${indentClass}`}>
      {schema.map((field, index) => {
        const fieldId = field.id || `field-${level}-${index}`;
        return (
          <div className="space-y-2 rounded-md border p-3" key={fieldId}>
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label
                  className="ml-1"
                  htmlFor={`field-name-${level}-${index}`}
                >
                  Property Name
                </Label>
                <Bound args={[index]} fn={changeName}>
                  {(onNameChange) => (
                    <Input
                      disabled={disabled}
                      id={`field-name-${level}-${index}`}
                      onChange={onNameChange}
                      placeholder="propertyName"
                      value={field.name}
                    />
                  )}
                </Bound>
              </div>
              <div className="flex-1 space-y-2">
                <Label
                  className="ml-1"
                  htmlFor={`field-type-${level}-${index}`}
                >
                  Type
                </Label>
                <Bound args={[index]} fn={changeType}>
                  {(onTypeChange) => (
                    <Select
                      disabled={disabled}
                      onValueChange={onTypeChange}
                      value={field.type}
                    >
                      <SelectTrigger
                        className="w-full"
                        id={`field-type-${level}-${index}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">String</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                        <SelectItem value="array">Array</SelectItem>
                        <SelectItem value="object">Object</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </Bound>
              </div>
              <div className="flex items-end">
                <Bound args={[index]} fn={removeField}>
                  {(onRemove) => (
                    <Button
                      disabled={disabled}
                      onClick={onRemove}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Bound>
              </div>
            </div>

            {field.type === "array" && (
              <div className="space-y-2">
                <Label
                  className="ml-1"
                  htmlFor={`field-item-type-${level}-${index}`}
                >
                  Array Item Type
                </Label>
                <Bound args={[index]} fn={changeItemType}>
                  {(onItemTypeChange) => (
                    <Select
                      disabled={disabled}
                      onValueChange={onItemTypeChange}
                      value={field.itemType || "string"}
                    >
                      <SelectTrigger
                        className="w-full"
                        id={`field-item-type-${level}-${index}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">String</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                        <SelectItem value="object">Object</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </Bound>
              </div>
            )}

            {field.type === "object" && (
              <div className="mt-2">
                <Label className="mb-2 block">Object Properties</Label>
                <Bound args={[index]} fn={updateNestedFields}>
                  {(onNestedChange) => (
                    <SchemaBuilder
                      disabled={disabled}
                      level={level + 1}
                      onChange={onNestedChange}
                      schema={field.fields || []}
                    />
                  )}
                </Bound>
              </div>
            )}

            {field.type === "array" && field.itemType === "object" && (
              <div className="mt-2">
                <Label className="mb-2 block">Array Item Properties</Label>
                <Bound args={[index]} fn={updateNestedFields}>
                  {(onNestedChange) => (
                    <SchemaBuilder
                      disabled={disabled}
                      level={level + 1}
                      onChange={onNestedChange}
                      schema={field.fields || []}
                    />
                  )}
                </Bound>
              </div>
            )}

            <div className="space-y-2">
              <Label className="ml-1" htmlFor={`field-desc-${level}-${index}`}>
                Description (optional)
              </Label>
              <Bound args={[index]} fn={changeDescription}>
                {(onDescriptionChange) => (
                  <Input
                    disabled={disabled}
                    id={`field-desc-${level}-${index}`}
                    onChange={onDescriptionChange}
                    placeholder="Description for the AI"
                    value={field.description || ""}
                  />
                )}
              </Bound>
            </div>
          </div>
        );
      })}

      <Button
        className="w-full"
        disabled={disabled}
        onClick={addField}
        type="button"
        variant="outline"
      >
        <Plus className="size-4" />
        Add Property
      </Button>
    </div>
  );
}
