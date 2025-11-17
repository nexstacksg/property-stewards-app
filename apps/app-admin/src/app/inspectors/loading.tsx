import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="p-6 grid place-items-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading inspectors…</span>
      </div>
    </div>
  )
}
