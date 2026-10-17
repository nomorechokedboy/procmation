"use client";

import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInputChange } from "@/hooks/use-input-change";
import { api, type Department } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

const NO_PARENT = "none";

type DepartmentsCardProps = {
  departments: Department[];
  onChanged: () => Promise<void>;
};

type ParentSelectProps = {
  value: string;
  onChange: (value: string) => void;
  departments: Department[];
  excludeId?: string;
};

function ParentSelect({
  value,
  onChange,
  departments,
  excludeId,
}: ParentSelectProps) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PARENT}>{m.departments_no_parent()}</SelectItem>
        {departments
          .filter((department) => department.id !== excludeId)
          .map((department) => (
            <SelectItem key={department.id} value={department.id}>
              {department.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function EditDepartmentDialog({
  department,
  departments,
  onClose,
  onChanged,
}: {
  department: Department;
  departments: Department[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(department.name);
  const [parentId, setParentId] = useState(department.parentId ?? NO_PARENT);
  const [saving, setSaving] = useState(false);
  const handleNameChange = useInputChange(setName);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setSaving(true);
      try {
        await api.department.update(department.id, {
          name,
          parentId: parentId === NO_PARENT ? null : parentId,
        });
        await onChanged();
        toast.success(m.departments_updated());
        onClose();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.processes_update_failed()
        );
        setSaving(false);
      }
    },
    [department.id, name, parentId, onChanged, onClose]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{m.departments_edit_title()}</DialogTitle>
            <DialogDescription>
              {m.departments_edit_description()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-department-name">{m.common_name()}</Label>
            <Input
              id="edit-department-name"
              onChange={handleNameChange}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label>{m.departments_parent()}</Label>
            <ParentSelect
              departments={departments}
              excludeId={department.id}
              onChange={setParentId}
              value={parentId}
            />
          </div>
          <DialogFooter>
            <Button disabled={saving} type="submit">
              {saving ? m.common_saving() : m.common_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentRow({
  department,
  parentName,
  onEdit,
  onDelete,
}: {
  department: Department;
  parentName: string | null;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
}) {
  const handleEdit = useCallback(
    () => onEdit(department),
    [department, onEdit]
  );
  const handleDeleteClick = useCallback(
    () => onDelete(department),
    [department, onDelete]
  );

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{department.name}</p>
        <p className="text-muted-foreground text-xs">
          {parentName ? m.departments_under({ name: parentName }) : ""}
          {department.memberCount === 1
            ? m.departments_member_one({ count: 1 })
            : m.departments_member_other({ count: department.memberCount })}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleEdit} size="sm" variant="outline">
          {m.common_edit()}
        </Button>
        <Button onClick={handleDeleteClick} size="sm" variant="outline">
          {m.common_delete()}
        </Button>
      </div>
    </div>
  );
}

export function DepartmentsCard({
  departments,
  onChanged,
}: DepartmentsCardProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(NO_PARENT);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const handleNameChange = useInputChange(setName);
  const handleCloseEdit = useCallback(() => setEditing(null), []);
  const handleDeleteOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleting(null);
    }
  }, []);

  const nameById = new Map(
    departments.map((department) => [department.id, department.name])
  );

  const handleCreate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setCreating(true);
      try {
        await api.department.create({
          name,
          parentId: parentId === NO_PARENT ? null : parentId,
        });
        setName("");
        setParentId(NO_PARENT);
        await onChanged();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.departments_create_failed()
        );
      } finally {
        setCreating(false);
      }
    },
    [name, parentId, onChanged]
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.department.delete(deleting.id);
      await onChanged();
      toast.success(m.departments_deleted());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.departments_delete_failed()
      );
    } finally {
      setDeleting(null);
    }
  }, [deleting, onChanged]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.departments_title()}</CardTitle>
        <CardDescription>{m.departments_description()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={handleCreate}
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="department-name">{m.common_name()}</Label>
            <Input
              id="department-name"
              onChange={handleNameChange}
              required
              value={name}
            />
          </div>
          <div className="space-y-2 sm:w-48">
            <Label>{m.departments_parent()}</Label>
            <ParentSelect
              departments={departments}
              onChange={setParentId}
              value={parentId}
            />
          </div>
          <Button disabled={creating} type="submit">
            {creating ? m.departments_adding() : m.departments_add()}
          </Button>
        </form>

        {departments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {m.departments_empty()}
          </p>
        ) : (
          <div className="divide-y">
            {departments.map((department) => (
              <DepartmentRow
                department={department}
                key={department.id}
                onDelete={setDeleting}
                onEdit={setEditing}
                parentName={
                  department.parentId
                    ? (nameById.get(department.parentId) ??
                      m.departments_unknown())
                    : null
                }
              />
            ))}
          </div>
        )}
      </CardContent>

      {editing ? (
        <EditDepartmentDialog
          department={editing}
          departments={departments}
          onChanged={onChanged}
          onClose={handleCloseEdit}
        />
      ) : null}

      <AlertDialog
        onOpenChange={handleDeleteOpenChange}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.departments_delete_title({ name: deleting?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.departments_delete_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
