"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "@/server/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    null,
  );
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="org-name">組織名稱</Label>
        <Input
          id="org-name"
          name="name"
          required
          maxLength={100}
          placeholder="例：我的公司"
        />
      </div>
      {state?.error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "建立中…" : "建立組織並進入"}
      </Button>
    </form>
  );
}
