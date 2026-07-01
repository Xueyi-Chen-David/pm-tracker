"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { setActiveOrgAction } from "@/server/actions/organizations";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Org = { id: string; name: string };

export function OrgSwitcher({
  activeOrg,
  orgs,
}: {
  activeOrg: Org;
  orgs: Org[];
}) {
  const [pending, start] = useTransition();

  function switchTo(id: string) {
    if (id === activeOrg.id || pending) return;
    start(async () => {
      await setActiveOrgAction(id);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="bg-card hover:bg-muted flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-60"
      >
        <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {activeOrg.name}
        </span>
        <ChevronsUpDown className="text-muted-foreground h-4 w-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>切換組織</DropdownMenuLabel>
          {orgs.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => switchTo(o.id)}>
              <Building2 className="text-muted-foreground h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.id === activeOrg.id && (
                <Check className="text-primary h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/orgs" />}>
          <Plus className="h-4 w-4" /> 建立 / 管理組織
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
