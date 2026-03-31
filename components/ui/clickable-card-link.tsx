import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof Link> & {
  /** Optional: if true, removes hover lift/glow behavior. */
  interactive?: boolean;
};

export function ClickableCardLink({ className, interactive = true, ...props }: Props) {
  return (
    <Link
      className={cn(
        "group block rounded-2xl outline-none",
        "focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
        interactive && "aa-card-interactive",
        className,
      )}
      {...props}
    />
  );
}

