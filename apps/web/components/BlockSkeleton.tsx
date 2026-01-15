"use client";

import { motion } from "framer-motion";

interface BlockSkeletonProps {
  color?: string;
  aspectRatio?: number;
}

export function BlockSkeleton({
  color = "#1a1a1a",
  aspectRatio = 1.5,
}: BlockSkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-full overflow-hidden rounded-[4px]"
      style={{
        backgroundColor: color,
        aspectRatio: aspectRatio.toString(),
      }}
    >
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)`,
        }}
        animate={{
          x: ["-100%", "100%"],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </motion.div>
  );
}
