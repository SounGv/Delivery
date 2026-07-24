import { animate } from "framer-motion"
import { useEffect, useRef, useState } from "react"

export function useAnimatedNumber(value: number): number {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: setDisplay,
    })
    prev.current = value
    return () => controls.stop()
  }, [value])

  return display
}
