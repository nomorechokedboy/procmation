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
import * as m from "@/paraglide/messages";

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
  const [departmentId, setDepartmentId] = useState(member.departmentId ?? NONE);
  const [managerId, setManagerId] = useState(member.managerId ?? NONE);
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.member.updateProfile(member.id, {
        departmentId: departmentId === NONE ? null : departmentId,
        jobTitle: jobTitle.trim() || null,
        managerId: managerId === NONE ? null : managerId,
      });
      await onSaved();
      toast.success(m.member_profile_updated());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.common_save_failed());
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
              {m.member_profile_description()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="job-title">{m.member_profile_job_title()}</Label>
            <Input
              id="job-title"
              maxLength={100}
              onChange={(event) => setJobTitle(event.target.value)}
              value={jobTitle}
            />
          </div>

          <div className="space-y-2">
            <Label>{m.departments_label()}</Label>
            <Select onValueChange={setDepartmentId} value={departmentId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {m.member_profile_no_department()}
                </SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{m.member_profile_manager()}</Label>
            <Select onValueChange={setManagerId} value={managerId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {m.member_profile_no_manager()}
                </SelectItem>
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
              {saving ? m.common_saving() : m.common_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
