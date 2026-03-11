import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'

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
  const [open, setOpen] = useState(false)

  const normalizedOptions = useMemo(() => {
    const seen = new Set<string>()
    return options.filter((option) => {
      const id = option.id.trim()
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [options])

  return (
    <label className="label">
      {label}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Command className="combobox-command" shouldFilter>
          <div className="combobox-anchor" data-ui="model-alias-combobox">
            <Command.Input
              id={inputId}
              className="input combobox-input"
              value={value}
              disabled={disabled}
              placeholder={placeholder}
              onFocus={() => {
                if (!disabled) setOpen(true)
              }}
              onValueChange={(next) => onChange(next)}
              aria-expanded={open}
              aria-controls={`${inputId}-listbox`}
              role="combobox"
              aria-autocomplete="list"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <Popover.Trigger asChild>
              <button
                type="button"
                className="combobox-trigger"
                aria-label="打开模型列表"
                disabled={disabled}
              >
                <ChevronDown size={18} />
              </button>
            </Popover.Trigger>
          </div>

          <Popover.Portal>
            <Popover.Content
              className="combobox-popover"
              align="start"
              side="bottom"
              sideOffset={8}
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <Command.List id={`${inputId}-listbox`} className="combobox-list">
                <Command.Empty className="combobox-empty">无匹配模型，继续输入即可。</Command.Empty>
                {normalizedOptions.map((option) => (
                  <Command.Item
                    key={option.id}
                    value={option.id}
                    className="combobox-item"
                    onSelect={() => {
                      onChange(option.id)
                      setOpen(false)
                    }}
                  >
                    <span className="combobox-item-main">{option.id}</span>
                  </Command.Item>
                ))}
              </Command.List>
            </Popover.Content>
          </Popover.Portal>
        </Command>
      </Popover.Root>
    </label>
  )
}

