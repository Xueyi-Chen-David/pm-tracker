"use client";

import { useRouter } from "next/navigation";

/** 季別切換：導向 /okr?cycle=… 。 */
export function OkrCycleSelect({
  cycles,
  active,
}: {
  cycles: string[];
  active: string;
}) {
  const router = useRouter();
  const opts = cycles.includes(active) ? cycles : [active, ...cycles];
  return (
    <select
      value={active}
      onChange={(e) =>
        router.push(`/okr?cycle=${encodeURIComponent(e.currentTarget.value)}`)
      }
      className="border-input h-9 rounded-md border bg-transparent px-3 text-sm font-medium"
    >
      {opts.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
