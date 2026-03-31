"use client";

import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        richColors
        theme="dark"
        position="bottom-right"
        closeButton
        className="font-sans"
        toastOptions={{
          style: {
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "white",
          },
        }}
      />
    </>
  );
}
