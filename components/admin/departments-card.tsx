"use client";

import { type FormEvent, useState } from "react";
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
import { api, type Department } from "@/lib/api-client";

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
        <SelectItem value={NO_PARENT}>No parent</SelectItem>
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.department.update(department.id, {
        name,
        parentId: parentId === NO_PARENT ? null : parentId,
      });
      await onChanged();
      toast.success("Department updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit department</DialogTitle>
            <DialogDescription>
              Rename it or move it under another department.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-department-name">Name</Label>
            <Input
              id="edit-department-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label>Parent</Label>
            <ParentSelect
              departments={departments}
              excludeId={department.id}
              onChange={setParentId}
              value={parentId}
            />
          </div>
          <DialogFooter>
            <Button disabled={saving} type="submit">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

  const nameById = new Map(
    departments.map((department) => [department.id, department.name])
  );

  const handleCreate = async (event: FormEvent) => {
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
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.department.delete(deleting.id);
      await onChanged();
      toast.success("Department deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Departments</CardTitle>
        <CardDescription>
          Departments group people and can own tasks that anyone in them can
          pick up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={handleCreate}
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="department-name">Name</Label>
            <Input
              id="department-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div className="space-y-2 sm:w-48">
            <Label>Parent</Label>
            <ParentSelect
              departments={departments}
              onChange={setParentId}
              value={parentId}
            />
          </div>
          <Button disabled={creating} type="submit">
            {creating ? "Adding..." : "Add department"}
          </Button>
        </form>

        {departments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No departments yet.
          </p>
        ) : (
          <div className="divide-y">
            {departments.map((department) => (
              <div
                className="flex items-center justify-between gap-3 py-3"
                key={department.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">
                    {department.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {department.parentId
                      ? `Under ${nameById.get(department.parentId) ?? "unknown"}, `
                      : ""}
                    {department.memberCount}{" "}
                    {department.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setEditing(department)}
                    size="sm"
                    variant="outline"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => setDeleting(department)}
                    size="sm"
                    variant="outline"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editing ? (
        <EditDepartmentDialog
          department={editing}
          departments={departments}
          onChanged={onChanged}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              People in it will have no department, and its sub-departments
              move to the top level. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
