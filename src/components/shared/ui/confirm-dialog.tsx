import * as Dialog from "@radix-ui/react-dialog"
import { AlertTriangle, X } from "lucide-react"
import { cloneElement, isValidElement, useRef, useState } from "react"

import { useHydrated } from "@/components/shared/hooks/use-hydrated"
import { useLocaleText } from "@/lib/i18n"

export function ConfirmDialog({
  title,
  description,
  confirmText,
  cancelText,
  tone = "neutral",
  disabled,
  onConfirm,
  children,
}: {
  title: string
  description: string
  confirmText: string
  cancelText?: string
  tone?: "danger" | "neutral"
  disabled?: boolean
  onConfirm: () => void | Promise<void>
  children: React.ReactNode
}) {
  const text = useLocaleText()
  const hydrated = useHydrated()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  if (!hydrated) {
    if (isValidElement(children)) {
      const elementType = children.type
      const isButton = typeof elementType === "string" && elementType === "button"
      return cloneElement(children, {
        ...(isButton ? { disabled: true } : { "aria-disabled": true }),
      })
    }

    return <>{children}</>
  }

  async function handleConfirm() {
    setConfirming(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setConfirming(false)
    }
  }

  const confirmClass = tone === "danger" ? "button danger" : "button secondary"

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild disabled={disabled}>
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelButtonRef.current?.focus()
          }}
        >
          <div className="dialog-head">
            <span className={`dialog-icon${tone === "danger" ? " danger" : ""}`}>
              <AlertTriangle size={18} />
            </span>
            <div className="dialog-copy">
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
              <Dialog.Description className="dialog-description">{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button dialog-close" aria-label={text("关闭确认窗口", "Close confirmation dialog")}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button
                ref={cancelButtonRef}
                type="button"
                className="button ghost"
                disabled={confirming}
              >
                {cancelText ?? text("返回", "Back")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={confirmClass}
              onClick={() => void handleConfirm()}
              disabled={confirming}
            >
              {confirming ? text("处理中...", "Working...") : confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
