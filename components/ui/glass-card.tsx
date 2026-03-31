import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function GlassCard({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <Card
      className={cn(
        // Card already provides the base glass surface; keep this as a thin wrapper for backwards compatibility.
        hover && "aa-card-interactive hover:bg-white/8 hover:border-white/20 hover:shadow-xl",
        className,
      )}
    >
      {children}
    </Card>
  );
}

