"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { api, type Department, type Member } from "@/lib/api-client";

const NONE = "none";

type MemberProfileDialogProps = {
  member: Member;
  members: Member[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function MemberProfileDialog({
  member,
  members,
  departments,
  onClose,
  onSaved,
}: MemberProfileDialogProps) {
  const [departmentId, setDepartmentId] = useState(
    member.departmentId ?? NONE
  );
  const [managerId, setManagerId] = useState(member.managerId ?? NONE);
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.member.updateProfile(member.id, {
        departmentId: departmentId === NONE ? null : departmentId,
        managerId: managerId === NONE ? null : managerId,
        jobTitle: jobTitle.trim() || null,
      });
      await onSaved();
      toast.success("Profile updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{member.name || member.email}</DialogTitle>
            <DialogDescription>
              Department and manager decide who can be asked to approve
              things for this person.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="job-title">Job title</Label>
            <Input
              id="job-title"
              maxLength={100}
              onChange={(event) => setJobTitle(event.target.value)}
              value={jobTitle}
            />
          </div>

          <div className="space-y-2">
            <Label>Department</Label>
            <Select onValueChange={setDepartmentId} value={departmentId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No department</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Manager</Label>
            <Select onValueChange={setManagerId} value={managerId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No manager</SelectItem>
                {members
                  .filter((other) => other.id !== member.id)
                  .map((other) => (
                    <SelectItem key={other.id} value={other.id}>
                      {other.name || other.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
