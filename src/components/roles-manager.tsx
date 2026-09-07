"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck, Users } from "lucide-react";
import {
  createRole,
  updateRole,
  deleteRole,
} from "@/server/actions/roles";
import { permissionsByGroup, type PermissionKey } from "@/lib/permissions";
import { ROLE_VISIBLE_MODULES } from "@/lib/modules";
import type { OrgRoleEntry } from "@/server/queries";
import type { NameSource } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { displayInitial } from "@/lib/display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const PRESET_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#64748b",
];

const GROUPS = permissionsByGroup();
const PERMISSION_LABEL = new Map(
  GROUPS.flatMap((g) => g.items).map((p) => [p.key, p.label]),
);

type Editing =
  | { mode: "create" }
  | { mode: "edit"; role: OrgRoleEntry }
  | null;

type AdminMember = NameSource & {
  id: string;
  image: string | null;
  role: "OWNER" | "ADMIN";
};

/**
 * 自訂角色（人資 / 會計…）管理：新增 / 編輯 / 刪除，並勾選各角色權限。管理者專用。
 * 上方另外附一份唯讀的「目前管理者」名單——管理者天生擁有全部權限、不受下方角色限制，
 * 這裡只是讓「誰是管理者」在同一頁一眼看到；要調整名單請到「成員」分頁右上角「管理者」按鈕。
 */
export function RolesManager({
  roles,
  admins,
}: {
  roles: OrgRoleEntry[];
  admins: AdminMember[];
}) {
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck className="h-4 w-4" /> 管理者（擁有者 / 管理員）
        </div>
        <p className="text-muted-foreground text-xs">
          天生擁有全部權限（含下面所有自訂角色的權限總和），不需要、也不受自訂角色限制。
          要新增 / 移除管理者，到「成員」分頁右上角「管理者」按鈕設定。
        </p>
        <div className="flex flex-wrap gap-2">
          {admins.map((a) => (
            <span
              key={a.id}
              className="bg-muted/40 inline-flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1"
            >
              <Avatar className="h-5 w-5 shrink-0">
                {a.image && <AvatarImage src={a.image} alt="" />}
                <AvatarFallback className="text-[9px]">
                  {displayInitial(a)}
                </AvatarFallback>
              </Avatar>
              <MemberName u={a} className="text-xs font-medium" />
              <span className="text-muted-foreground text-[10px]">
                {a.role === "OWNER" ? "擁有者" : "管理員"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          自訂角色（如 人資、會計）：先定義職能角色，再勾選各角色可用的權限與可見頁面。
          一位成員可指派多個角色，權限取聯集。
        </p>
        <Button onClick={() => setEditing({ mode: "create" })} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" /> 新增角色
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          尚未建立任何角色。<br />
          點右上「新增角色」建立第一個（例如 人資、會計）。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((r) => (
            <RoleCard key={r.id} role={r} onEdit={() => setEditing({ mode: "edit", role: r })} />
          ))}
        </div>
      )}

      {editing && (
        <RoleDialog
          key={editing.mode === "edit" ? editing.role.id : "create"}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RoleCard({
  role,
  onEdit,
}: {
  role: OrgRoleEntry;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (
      !confirm(
        `確定刪除角色「${role.name}」？已指派此角色的 ${role.memberCount} 位成員會解除此角色。`,
      )
    )
      return;
    start(async () => {
      try {
        await deleteRole(role.id);
        toast.success("已刪除角色");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-white"
          style={{ backgroundColor: role.color ?? "#64748b" }}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {role.name}
        </span>
        <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-xs">
          <Users className="h-3.5 w-3.5" />
          {role.memberCount}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="hover:bg-muted rounded p-1"
          title="編輯"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="hover:bg-muted rounded p-1 text-rose-600 disabled:opacity-50"
          title="刪除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {role.description && (
        <p className="text-muted-foreground text-xs">{role.description}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {role.permissions.length === 0 ? (
          <span className="text-muted-foreground text-[11px]">尚未授予權限</span>
        ) : (
          role.permissions.map((p) => (
            <span
              key={p}
              className="bg-muted rounded px-1.5 py-0.5 text-[11px]"
            >
              {PERMISSION_LABEL.get(p as PermissionKey) ?? p}
            </span>
          ))
        )}
      </div>
      <div className="text-muted-foreground text-[11px]">
        可見頁面：
        {role.visibleModules.length === 0
          ? "全部"
          : `${role.visibleModules.length} 頁`}
      </div>
    </Card>
  );
}

function RoleDialog({
  editing,
  onClose,
}: {
  editing: Exclude<Editing, null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const existing = editing.mode === "edit" ? editing.role : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? PRESET_COLORS[0]);
  const [perms, setPerms] = useState<Set<string>>(
    () => new Set(existing?.permissions ?? []),
  );
  // 可見頁面白名單（空＝可見全部頁面）。
  const [pages, setPages] = useState<Set<string>>(
    () => new Set(existing?.visibleModules ?? []),
  );

  function togglePerm(key: string, on: boolean) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function togglePage(key: string, on: boolean) {
    setPages((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const restrictPages = pages.size > 0;

  function submit() {
    if (!name.trim()) {
      toast.error("請輸入角色名稱");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      permissions: [...perms],
      visibleModules: [...pages],
    };
    start(async () => {
      try {
        const res = existing
          ? await updateRole({ id: existing.id, ...payload })
          : await createRole(payload);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(existing ? "已更新角色" : "已建立角色");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "編輯角色" : "新增角色"}</DialogTitle>
          <DialogDescription>
            設定角色名稱與其權限。具此角色的成員即獲得下列勾選的權限。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="role-name">角色名稱</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：人資、會計"
              maxLength={40}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="role-desc">說明（選填）</Label>
            <Textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="這個角色負責什麼？"
              rows={2}
              maxLength={200}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>標籤顏色</Label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={
                    "h-6 w-6 rounded-full ring-offset-2 " +
                    (color === c ? "ring-primary ring-2" : "")
                  }
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border"
                title="自訂顏色"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>可見頁面</Label>
              <span className="text-muted-foreground text-xs">
                {restrictPages ? `只顯示 ${pages.size} 個頁面` : "可見全部頁面"}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              預設可見全部頁面。若只想讓此角色看到部分頁面，勾選要顯示的頁面即可
              （不勾＝全部顯示）。每日報告 / 待辦 / 個人資料一律可見，不受此限。
            </p>
            <div className="grid grid-cols-2 gap-1">
              {ROLE_VISIBLE_MODULES.map((m) => (
                <label
                  key={m.key}
                  className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={pages.has(m.key)}
                    onChange={(e) => togglePage(m.key, e.currentTarget.checked)}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="min-w-0 truncate">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>權限</Label>
            {GROUPS.map((g) => (
              <div key={g.group} className="space-y-1.5">
                <div className="text-muted-foreground text-xs font-semibold">
                  {g.group}
                </div>
                {g.items.map((p) => (
                  <label
                    key={p.key}
                    className="hover:bg-muted flex items-start gap-2 rounded-md px-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={perms.has(p.key)}
                      onChange={(e) => togglePerm(p.key, e.currentTarget.checked)}
                      className="accent-primary mt-0.5 h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="text-muted-foreground block text-xs">
                        {p.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {existing ? "儲存" : "建立角色"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
