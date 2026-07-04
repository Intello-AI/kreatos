"use client"

import type { CSSProperties } from "react"
import { memo, useMemo } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

export interface TextShimmerProps {
  children: string
  className?: string
  duration?: number
  spread?: number
}

/**
 * Texto con barrido de luz (shimmer) para estados "en ejecución".
 * Versión span-only del ai-element original (sin factory dinámico de
 * componentes, que rompe la regla del compilador de React).
 */
const ShimmerComponent = ({
  children,
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  )

  return (
    <motion.span
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </motion.span>
  )
}

export const Shimmer = memo(ShimmerComponent)
