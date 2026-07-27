"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Crosshair, Settings2 } from "lucide-react";
import { setCheckInConfig } from "@/server/actions/org-settings";
import type { CheckInMatchMode, Geofence } from "@/lib/checkin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type FenceDraft = {
  label: string;
  lat: string;
  lng: string;
  radiusM: string;
};

function toDraft(f: Geofence): FenceDraft {
  return {
    label: f.label ?? "",
    lat: String(f.lat),
    lng: String(f.lng),
    radiusM: String(f.radiusM),
  };
}

export function CheckInSettings({
  enabled: initialEnabled,
  allowedIps: initialIps,
  geofences: initialFences,
  matchMode: initialMatchMode,
}: {
  enabled: boolean;
  allowedIps: string[];
  geofences: Geofence[];
  matchMode: CheckInMatchMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [enabled, setEnabled] = useState(initialEnabled);
  const [matchMode, setMatchMode] = useState<CheckInMatchMode>(initialMatchMode);
  const [ipsText, setIpsText] = useState(initialIps.join("\n"));
  const [fences, setFences] = useState<FenceDraft[]>(
    initialFences.map(toDraft),
  );

  function addFence(coords?: { lat: number; lng: number }) {
    setFences((f) => [
      ...f,
      {
        label: "",
        lat: coords ? String(coords.lat) : "",
        lng: coords ? String(coords.lng) : "",
        radiusM: "200",
      },
    ]);
  }

  function addFenceHere() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("此裝置不支援定位。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => addFence({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("取得定位失敗，請允許瀏覽器定位權限。"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function updateFence(i: number, patch: Partial<FenceDraft>) {
    setFences((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function removeFence(i: number) {
    setFences((f) => f.filter((_, idx) => idx !== i));
  }

  function save() {
    // 解析地理圍欄；座標 / 半徑無效者略過。
    const geofences: Geofence[] = [];
    for (const d of fences) {
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      const radiusM = Number(d.radiusM);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!Number.isFinite(radiusM) || radiusM <= 0) continue;
      geofences.push({
        label: d.label.trim() || undefined,
        lat,
        lng,
        radiusM,
      });
    }
    const allowedIps = ipsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (enabled && allowedIps.length === 0 && geofences.length === 0) {
      toast.error("啟用打卡需至少設定一個允許 IP 或一個地點。");
      return;
    }
    if (
      enabled &&
      matchMode === "all" &&
      (allowedIps.length === 0 || geofences.length === 0)
    ) {
      toast.error("選擇「兩者皆須符合」時，需同時設定 IP／網段與地點。");
      return;
    }

    start(async () => {
      try {
        const res = await setCheckInConfig({ enabled, allowedIps, geofences, matchMode });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("已儲存打卡設定");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        title="打卡設定"
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden sm:inline">打卡設定</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>打卡設定</DialogTitle>
            <DialogDescription>
              {matchMode === "all"
                ? "員工需同時符合「允許的 IP」與「地點範圍」才算有效打卡。"
                : "員工需符合「允許的 IP」或「地點範圍」任一即算有效打卡。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <label className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.currentTarget.checked)}
                className="accent-primary h-4 w-4"
              />
              啟用員工打卡
            </label>

            <div className="space-y-1.5">
              <Label>符合條件</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      key: "any" as const,
                      title: "任一符合",
                      hint: "IP 或 地點",
                    },
                    {
                      key: "all" as const,
                      title: "兩者皆須符合",
                      hint: "IP 且 地點",
                    },
                  ] satisfies { key: CheckInMatchMode; title: string; hint: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMatchMode(opt.key)}
                    aria-pressed={matchMode === opt.key}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      matchMode === opt.key
                        ? "border-primary bg-primary/5 ring-primary/30 ring-1"
                        : "border-input hover:bg-muted/50",
                    )}
                  >
                    <div className="font-medium">{opt.title}</div>
                    <div className="text-muted-foreground text-xs">{opt.hint}</div>
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {matchMode === "all"
                  ? "需同時連上允許的網路（IP）並位於允許的地點範圍內。只設定其中一項時，等同只判該項。"
                  : "只要在允許的網路（IP）內、或位於允許的地點範圍內，其中一項符合即可打卡。"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-ips">允許的 IP / 網段（每行一個）</Label>
              <textarea
                id="ci-ips"
                value={ipsText}
                onChange={(e) => setIpsText(e.currentTarget.value)}
                rows={3}
                placeholder={"203.0.113.10\n118.163.0.0/16"}
                className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
              <p className="text-muted-foreground text-xs">
                支援單一 IP 或 IPv4 CIDR 網段（如 118.163.0.0/16）。
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> 允許的地點（GPS 圍欄）
                </Label>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={addFenceHere}
                  >
                    <Crosshair className="h-3.5 w-3.5" /> 以目前位置
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => addFence()}
                  >
                    <Plus className="h-3.5 w-3.5" /> 手動
                  </Button>
                </div>
              </div>

              {fences.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  尚未設定地點。若只用 IP 限制可留空。
                </p>
              ) : (
                <div className="space-y-2">
                  {fences.map((f, i) => (
                    <div key={i} className="space-y-2 rounded-md border p-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={f.label}
                          onChange={(e) =>
                            updateFence(i, { label: e.currentTarget.value })
                          }
                          placeholder="地點名稱（例：總公司）"
                          className="h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-rose-600"
                          onClick={() => removeFence(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-[11px]">
                            緯度 lat
                          </span>
                          <Input
                            value={f.lat}
                            onChange={(e) =>
                              updateFence(i, { lat: e.currentTarget.value })
                            }
                            placeholder="25.0330"
                            className="h-8"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-[11px]">
                            經度 lng
                          </span>
                          <Input
                            value={f.lng}
                            onChange={(e) =>
                              updateFence(i, { lng: e.currentTarget.value })
                            }
                            placeholder="121.5654"
                            className="h-8"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-[11px]">
                            半徑（公尺）
                          </span>
                          <Input
                            value={f.radiusM}
                            onChange={(e) =>
                              updateFence(i, { radiusM: e.currentTarget.value })
                            }
                            placeholder="200"
                            className="h-8"
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "儲存中…" : "儲存設定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
