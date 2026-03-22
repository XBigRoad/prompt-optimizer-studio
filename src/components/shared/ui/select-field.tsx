"use client"

import * as Select from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import { useHydrated } from "@/components/shared/hooks/use-hydrated"

export type SelectFieldOption = {
  value: string
  label: string
}

export function SelectField({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: SelectFieldOption[]
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const selectedOption = options.find((option) => option.value === value)
  const hydrated = useHydrated()
  const stopScrollPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  if (!hydrated) {
    return (
      <label className="label">
        {label}
        <button type="button" className="select-field-trigger" data-ui="select-field" aria-label={label} disabled={disabled}>
          <span className={`select-field-value${selectedOption ? "" : " is-placeholder"}`}>
            {selectedOption?.label ?? placeholder ?? ""}
          </span>
          <span className="select-field-icon" aria-hidden="true">
            <ChevronDown size={18} />
          </span>
        </button>
      </label>
    )
  }

  return (
    <label className="label">
      {label}
      <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
        <Select.Trigger type="button" className="select-field-trigger" data-ui="select-field" aria-label={label}>
          <span className={`select-field-value${selectedOption ? "" : " is-placeholder"}`}>
            {selectedOption?.label ?? placeholder ?? ""}
          </span>
          <Select.Icon className="select-field-icon">
            <ChevronDown size={18} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="select-field-content"
            position="popper"
            side="bottom"
            sideOffset={8}
            collisionPadding={16}
            onWheelCapture={stopScrollPropagation}
            onTouchMoveCapture={stopScrollPropagation}
          >
            <Select.Viewport
              className="select-field-viewport"
              onWheelCapture={stopScrollPropagation}
              onTouchMoveCapture={stopScrollPropagation}
            >
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="select-field-item">
                  <Select.ItemIndicator className="select-field-item-indicator">
                    <Check size={16} />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  )
}
