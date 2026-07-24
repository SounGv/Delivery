import { DayPicker, type DayPickerProps } from "react-day-picker"
import "react-day-picker/style.css"
import { cn } from "@/lib/utils"

export function Calendar({ className, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("rdp-theme p-2", className)}
      showOutsideDays
      {...props}
    />
  )
}
