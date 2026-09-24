"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createProjectAction,
  updateProjectAction,
  type ActionState,
} from "@/server/actions/projects";
import {
  PROJECT_TYPE_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  HEALTH_OPTIONS,
  PROJECT_TYPE,
} from "@/lib/constants";
import { displayName } from "@/lib/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const PRESET_COLORS = [
  "#7c3aed", // violet
  "#2563eb", // blue
  "#0891b2", // cyan
  "#059669", // emerald
  "#d97706", // amber
  "#dc2626", // red
  "#db2777", // pink
  "#475569", // slate
];

type UserOption = { id: string; name: string | null; email: string | null };

export type ProjectFormValues = {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
  priority?: string;
  health?: string;
  progress?: number;
  ownerId?: string | null;
  startDate?: string;
  targetDate?: string;
  description?: string | null;
  color?: string | null;
};

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

const selectClass =
  "border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function ProjectForm({
  mode,
  values,
  users,
  onCancel,
}: {
  mode: "create" | "edit";
  values?: ProjectFormValues;
  users: UserOption[];
  onCancel?: () => void;
}) {
  const router = useRouter();
  const action = mode === "create" ? createProjectAction : updateProjectAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );
  const [type, setType] = useState(values?.type ?? "PROJECT");
  const [progress, setProgress] = useState(values?.progress ?? 0);
  const [color, setColor] = useState(values?.color ?? PRESET_COLORS[0]);

  return (
    <form action={formAction} className="space-y-5">
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="color" value={color} />

      <Field label="名稱" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={values?.name}
          placeholder="例：YMCA 第一階段合作與導入"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="類型" htmlFor="type" hint={PROJECT_TYPE[type as keyof typeof PROJECT_TYPE]?.hint}>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
          >
            {PROJECT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="優先序" htmlFor="priority">
          <select
            id="priority"
            name="priority"
            defaultValue={values?.priority ?? "MEDIUM"}
            className={selectClass}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="狀態" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={values?.status ?? "ACTIVE"}
            className={selectClass}
          >
            {PROJECT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="健康度（紅黃綠燈）" htmlFor="health">
          <select
            id="health"
            name="health"
            defaultValue={values?.health ?? "GREEN"}
            className={selectClass}
          >
            {HEALTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="負責人" htmlFor="ownerId">
          <select
            id="ownerId"
            name="ownerId"
            defaultValue={values?.ownerId ?? ""}
            className={selectClass}
          >
            <option value="">（我自己）</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`目前整體進度：${progress}%`} htmlFor="progress">
          <input
            id="progress"
            name="progress"
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="accent-primary h-9 w-full cursor-pointer"
          />
        </Field>

        <Field label="開始日" htmlFor="startDate">
          <DatePicker
            id="startDate"
            name="startDate"
            placeholder="未設定"
            defaultValue={values?.startDate}
          />
        </Field>

        <Field label="預計完成日（理想）" htmlFor="targetDate">
          <DatePicker
            id="targetDate"
            name="targetDate"
            placeholder="未設定"
            defaultValue={values?.targetDate}
          />
        </Field>
      </div>

      <Field label="標籤顏色（時程藍圖用）">
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 transition ${
                color === c ? "border-foreground scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border bg-transparent"
          />
        </div>
      </Field>

      <Field label="描述 / 目標" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={values?.description ?? ""}
          placeholder="這個專案 / 任務的目的、範圍、關鍵成果…"
        />
      </Field>

      {state?.error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel ?? (() => router.back())}
          disabled={pending}
        >
          取消
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "儲存中…" : mode === "create" ? "建立" : "儲存變更"}
        </Button>
      </div>
    </form>
  );
}
