'use client';

import { useEffect, useRef, useState } from 'react';
import { formatQuantityInput, parseQuantityInput, sanitizeQuantityDraft } from '../lib/quantity-input';

type Props = {
  value: number;
  onCommit: (value: number) => Promise<void> | void;
  allowFractional?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

export default function EditableQuantity({
  value,
  onCommit,
  allowFractional = false,
  disabled = false,
  className = '',
  ariaLabel = 'Quantidade',
}: Props) {
  const [draft, setDraft] = useState(formatQuantityInput(value, allowFractional));
  const [saving, setSaving] = useState(false);
  const focused = useRef(false);
  const committing = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formatQuantityInput(value, allowFractional));
  }, [value, allowFractional]);

  const commit = async () => {
    if (committing.current || disabled) return;
    const parsed = parseQuantityInput(draft, allowFractional);
    if (parsed == null || parsed === value) {
      setDraft(formatQuantityInput(value, allowFractional));
      return;
    }
    committing.current = true;
    setSaving(true);
    try {
      await onCommit(parsed);
      setDraft(formatQuantityInput(parsed, allowFractional));
    } catch {
      setDraft(formatQuantityInput(value, allowFractional));
    } finally {
      committing.current = false;
      setSaving(false);
    }
  };

  return (
    <input
      type="text"
      inputMode={allowFractional ? 'decimal' : 'numeric'}
      pattern={allowFractional ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      value={draft}
      disabled={disabled || saving}
      aria-label={ariaLabel}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        void commit();
      }}
      onChange={(event) => setDraft(sanitizeQuantityDraft(event.target.value, allowFractional))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setDraft(formatQuantityInput(value, allowFractional));
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}
