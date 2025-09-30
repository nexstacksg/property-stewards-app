export type ToastVariant = "default" | "success" | "error"

interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

const TOAST_CONTAINER_ID = "ps-toast-container"

function ensureContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID)
  if (!container) {
    container = document.createElement("div")
    container.id = TOAST_CONTAINER_ID
    container.className = "pointer-events-none fixed top-4 right-4 z-[1000] flex w-full max-w-sm flex-col gap-3"
    document.body.appendChild(container)
  }
  return container
}

function variantClasses(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-500 bg-emerald-600/10 text-emerald-900"
    case "error":
      return "border-red-500 bg-red-600/10 text-red-900"
    default:
      return "border-slate-200 bg-white text-slate-900 shadow"
  }
}

export function showToast({ title, description, variant = "default", duration = 4000 }: ToastOptions) {
  if (typeof window === "undefined") return

  const container = ensureContainer()
  const toast = document.createElement("div")
  toast.className = `pointer-events-auto overflow-hidden rounded-lg border p-4 transition-all duration-300 ease-out ${variantClasses(variant)}`
  toast.innerHTML = `
    <div class="flex flex-col gap-1">
      <strong class="text-sm font-medium">${title}</strong>
      ${description ? `<p class="text-xs text-slate-700">${description}</p>` : ""}
    </div>
  `

  container.appendChild(toast)

  requestAnimationFrame(() => {
    toast.classList.add("translate-x-0", "opacity-100")
  })

  const remove = () => {
    toast.classList.add("translate-x-full", "opacity-0")
    setTimeout(() => {
      toast.remove()
      if (container.childElementCount === 0) {
        container.remove()
      }
    }, 250)
  }

  toast.addEventListener("click", remove)
  setTimeout(remove, duration)
}
