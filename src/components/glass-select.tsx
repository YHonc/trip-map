'use client';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export type SelectOption = { value: string; label: string; detail?: string; disabled?: boolean };
export function GlassSelect({ label, value, options, onChange, disabled, placeholder = '请选择' }: {
  label: string; value: string; options: SelectOption[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
    <Select.Trigger className="glass-select-trigger" aria-label={label}><Select.Value placeholder={placeholder} /><Select.Icon><ChevronDown size={16} /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="glass-select-content" position="popper" sideOffset={7} collisionPadding={16}>
      <Select.ScrollUpButton className="glass-select-scroll"><ChevronUp size={15} /></Select.ScrollUpButton>
      <Select.Viewport className="glass-select-viewport">{options.map(option => <Select.Item key={option.value} className="glass-select-item" value={option.value} disabled={option.disabled} textValue={option.label}>
        <span className="glass-select-copy"><Select.ItemText>{option.label}</Select.ItemText>{option.detail && <small>{option.detail}</small>}</span><Select.ItemIndicator><Check size={16} /></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="glass-select-scroll"><ChevronDown size={15} /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
