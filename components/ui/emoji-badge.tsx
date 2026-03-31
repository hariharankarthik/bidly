"use client";

import { cn } from "@/lib/utils";

export function EmojiBadge({
  emoji,
  label,
  className,
}: {
  emoji: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        "inline-block cursor-default select-none align-middle text-base transition-transform hover:scale-125 motion-reduce:hover:scale-100",
        className,
      )}
    >
      {emoji}
    </span>
  );
}

