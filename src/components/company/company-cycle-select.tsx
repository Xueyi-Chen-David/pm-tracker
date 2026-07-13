"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * 公司營運頁的週期切換（季度用 ?qy= 選年份）。
 * 只改自己那個參數，保留其他，導回 /company。
 */
export function CompanyCycleSelect({
  param,
  active,
  options,
}: {
  param: "year" | "q" | "qy";
  active: string;
  options: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opts = options.includes(active) ? options : [active, ...options];

  function onChange(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(param, value);
    router.push(`/company?${sp.toString()}`);
  }

  return (
    <select
      value={active}
      onChange={(e) => onChange(e.currentTarget.value)}
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
