"use client";

import { useState } from "react";
import { ProjectForm } from "@/components/project-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type UserOption = { id: string; name: string | null; email: string | null };

export function NewProjectButton({
  users,
  trigger,
}: {
  users: UserOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增專案 / 任務</DialogTitle>
            <DialogDescription>
              可建立常態型、專案型或一次性任務，並指派負責人。
            </DialogDescription>
          </DialogHeader>
          <ProjectForm
            mode="create"
            users={users}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
