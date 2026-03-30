"use client";

import { AnimatePresence, motion } from "framer-motion";

export function SoldOverlay({ open, label }: { open: boolean; label: string }) {
  const unsold = label.toUpperCase().includes("UNSOLD");

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.82, opacity: 0, rotate: -2 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.92, opacity: 0, rotate: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            className={`rounded-2xl border px-10 py-7 text-center shadow-2xl ${
              unsold
                ? "border-amber-500/50 bg-amber-950/95"
                : "border-emerald-500/50 bg-emerald-950/95"
            }`}
          >
            <motion.p
              className={`text-4xl font-black tracking-tight sm:text-5xl ${unsold ? "text-amber-200" : "text-emerald-300"}`}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 }}
            >
              {label}
            </motion.p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
