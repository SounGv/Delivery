import { AlertTriangle } from "lucide-react"

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium text-foreground">โหลดข้อมูลไม่สำเร็จ</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
