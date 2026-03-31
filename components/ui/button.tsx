import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold select-none touch-manipulation transition-[transform,box-shadow,background-color,border-color,filter] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97] active:transition-[transform] active:duration-75 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md shadow-blue-900/35 hover:from-blue-400 hover:to-blue-500 hover:shadow-lg hover:shadow-blue-800/25 active:brightness-95 active:shadow-md",
        secondary:
          "bg-neutral-800/90 text-neutral-100 ring-1 ring-neutral-700/80 hover:bg-neutral-700/90 hover:ring-neutral-600 active:bg-neutral-800 active:brightness-95",
        outline:
          "border border-neutral-600/90 bg-neutral-950/40 text-neutral-100 hover:border-blue-500/40 hover:bg-blue-950/18 active:bg-blue-950/26",
        ghost: "text-neutral-300 hover:bg-neutral-900 hover:text-white active:bg-neutral-800/80",
        destructive:
          "bg-gradient-to-b from-red-600 to-red-700 text-white shadow-md shadow-red-950/40 hover:from-red-500 hover:to-red-600 active:brightness-95",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
