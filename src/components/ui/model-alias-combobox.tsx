"use client"

import * as Popover from "@radix-ui/react-popover"
import { Command } from "cmdk"
import { Check, ChevronDown, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { useHydrated } from "@/components/ui/use-hydrated"
import { useLocaleText } from "@/lib/i18n"

export type ModelOption = { id: string; label: string }

export function ModelAliasCombobox({
  inputId,
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  inputId: string
  label: string
  value: string
  options: ModelOption[]
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const text = useLocaleText()
  const hydrated = useHydrated()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [frozenOptions, setFrozenOptions] = useState<ModelOption[]>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const normalizedOptions = useMemo(() => {
    const seen = new Set<string>()
    return options
      .flatMap((option) => {
        const id = option.id.trim()
        if (!id || seen.has(id)) return []
        seen.add(id)
        return [{ id, label: option.label.trim() || id }]
      })
      .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" }))
  }, [options])

  const visibleOptions = open ? (frozenOptions.length > 0 ? frozenOptions : normalizedOptions) : normalizedOptions
  const trimmedQuery = query.trim()
  const hasExactMatch = visibleOptions.some((option) => option.id === trimmedQuery)
  const canUseTypedValue = trimmedQuery.length > 0 && !hasExactMatch
  const triggerValue = value.trim() || placeholder || text("选择任务模型", "Choose a task model")
  const stopScrollPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  useEffect(() => {
    if (!open) {
      return
    }

    setQuery("")
    setFrozenOptions(normalizedOptions)
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open, normalizedOptions])

  if (!hydrated) {
    return (
      <label className="label">
        {label}
        <div className="combobox-shell" data-ui="model-alias-combobox">
          <button
            type="button"
            className="combobox-trigger-surface"
            data-ui="model-alias-trigger"
            aria-label={label}
            aria-expanded="false"
            disabled={disabled}
          >
            <span className={`combobox-trigger-value${value.trim() ? "" : " is-placeholder"}`}>
              {triggerValue}
            </span>
            <span className="combobox-trigger-icon" aria-hidden="true">
              <ChevronDown size={18} />
            </span>
          </button>
        </div>
      </label>
    )
  }

  return (
    <label className="label">
      {label}
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (nextOpen) {
            setFrozenOptions(normalizedOptions)
            return
          }

          setFrozenOptions([])
        }}
      >
        <div className="combobox-shell" data-ui="model-alias-combobox">
          <Popover.Trigger asChild>
            <button
              type="button"
              className="combobox-trigger-surface"
              data-ui="model-alias-trigger"
              aria-label={label}
              aria-expanded={open}
              disabled={disabled}
            >
              <span className={`combobox-trigger-value${value.trim() ? "" : " is-placeholder"}`}>
                {triggerValue}
              </span>
              <span className="combobox-trigger-icon" aria-hidden="true">
                <ChevronDown size={18} />
              </span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="combobox-popover"
              align="start"
              side="bottom"
              sideOffset={8}
              collisionPadding={16}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onWheelCapture={stopScrollPropagation}
              onTouchMoveCapture={stopScrollPropagation}
            >
              <div className="combobox-popover-copy">
                <strong>{text("先从已拉取模型里选", "Pick from fetched models first")}</strong>
                <p className="small">
                  {text(
                    "找不到时，也可以直接输入模型名。",
                    "If you cannot find one, you can still enter a model name directly.",
                  )}
                </p>
              </div>

              <Command className="combobox-command" shouldFilter>
                <div className="combobox-search-row">
                  <span className="combobox-search-icon" aria-hidden="true">
                    <Search size={16} />
                  </span>
                  <Command.Input
                    ref={searchInputRef}
                    id={inputId}
                    className="combobox-search-input"
                    value={query}
                    placeholder={text("搜索或输入模型名", "Search or enter a model name")}
                    onValueChange={setQuery}
                    aria-controls={`${inputId}-listbox`}
                    role="combobox"
                    aria-autocomplete="list"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <Command.List
                  id={`${inputId}-listbox`}
                  className="combobox-list"
                  onWheelCapture={stopScrollPropagation}
                  onTouchMoveCapture={stopScrollPropagation}
                >
                  {canUseTypedValue ? (
                    <Command.Item
                      value={`manual:${trimmedQuery}`}
                      className="combobox-item combobox-item-create"
                      onSelect={() => {
                        onChange(trimmedQuery)
                        setOpen(false)
                      }}
                    >
                      <span className="combobox-item-main">{text("使用当前输入", "Use current input")}</span>
                      <span className="combobox-item-sub">{trimmedQuery}</span>
                    </Command.Item>
                  ) : null}

                  <Command.Empty className="combobox-empty">
                    {text("没有匹配项。可以直接使用当前输入。", "No match found. You can use the current input directly.")}
                  </Command.Empty>

                  {visibleOptions.map((option) => (
                    <Command.Item
                      key={option.id}
                      value={option.id}
                      className="combobox-item"
                      data-current={value === option.id ? "true" : undefined}
                      onSelect={() => {
                        onChange(option.id)
                        setOpen(false)
                      }}
                    >
                      <span className="combobox-item-main">{option.id}</span>
                      <span className="combobox-item-indicator" aria-hidden="true">
                        {value === option.id ? <Check size={16} /> : null}
                      </span>
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </Popover.Content>
          </Popover.Portal>
        </div>
      </Popover.Root>
    </label>
  )
}
