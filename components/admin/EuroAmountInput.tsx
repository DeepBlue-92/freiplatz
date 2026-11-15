import React, { useState, useEffect, useRef } from 'react';

export interface EuroAmountInputProps {
  id?: string;
  valueCents: number | null | undefined;
  onChangeCents: (newCents: number | null) => void;
  placeholder?: string;
  allowNull?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * An intuitive, German-currency input field (Euro).
 * 
 * - Preserves native cursor position and allows free editing at any decimal position.
 * - Accepts both comma ',' and period '.' seamlessly.
 * - Formats cleanly to two decimal places on blur (e.g. 2,5 -> 2,50 €).
 * - Synchronizes with parent state without cursor-jumping or reformatting mid-typing.
 */
export const EuroAmountInput: React.FC<EuroAmountInputProps> = ({
  id,
  valueCents,
  onChangeCents,
  placeholder,
  allowNull = false,
  size = 'sm',
  className,
  containerClassName = 'relative',
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatCents = (cents: number | null | undefined): string => {
    if (cents === null || cents === undefined) {
      return '';
    }
    return (cents / 100).toFixed(2).replace('.', ',');
  };

  const [rawText, setRawText] = useState<string>(() => {
    if (valueCents === null || valueCents === undefined) {
      return allowNull ? '' : '0,00';
    }
    return formatCents(valueCents);
  });

  // Sync from props only when not actively focused by the user
  useEffect(() => {
    if (!isFocused) {
      if (valueCents === null || valueCents === undefined) {
        setRawText(allowNull ? '' : '0,00');
      } else {
        setRawText(formatCents(valueCents));
      }
    }
  }, [valueCents, isFocused, allowNull]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;

    // Remove currency symbol and spaces (e.g. if pasted)
    val = val.replace(/[€\s]/g, '');

    // Normalize dots to commas
    val = val.replace(/\./g, ',');

    // Validate: only digits and at most one comma allowed
    const commaCount = (val.match(/,/g) || []).length;
    if (commaCount > 1 || !/^[\d,]*$/.test(val)) {
      return;
    }

    setRawText(val);

    // Parse and propagate to parent
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === ',') {
      onChangeCents(allowNull ? null : 0);
    } else {
      let normalized = trimmed.replace(',', '.');
      if (normalized.startsWith('.')) normalized = '0' + normalized;
      const parsed = parseFloat(normalized);
      if (!isNaN(parsed) && parsed >= 0) {
        onChangeCents(Math.round(parsed * 100));
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const trimmed = rawText.trim();
    if (trimmed === '' || trimmed === ',') {
      if (allowNull) {
        setRawText('');
        onChangeCents(null);
      } else {
        setRawText('0,00');
        onChangeCents(0);
      }
      return;
    }

    let normalized = trimmed.replace(',', '.');
    if (normalized.startsWith('.')) normalized = '0' + normalized;
    const parsed = parseFloat(normalized);

    if (isNaN(parsed) || parsed < 0) {
      // Fallback
      if (valueCents === null || valueCents === undefined) {
        setRawText(allowNull ? '' : '0,00');
        onChangeCents(allowNull ? null : 0);
      } else {
        setRawText(formatCents(valueCents));
      }
    } else {
      const cents = Math.round(parsed * 100);
      onChangeCents(cents);
      setRawText(formatCents(cents));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  const defaultInputClass =
    size === 'md'
      ? 'w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 font-semibold text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition-all pr-8'
      : 'w-20 px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-white outline-none focus:border-emerald-600 transition-all pr-6';

  const defaultSymbolClass =
    size === 'md'
      ? 'absolute right-3 top-2.5 text-sm font-medium text-slate-400 pointer-events-none'
      : 'absolute right-2 top-1.5 text-xs font-semibold text-slate-400 pointer-events-none';

  return (
    <div className={containerClassName}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        value={rawText}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className || defaultInputClass}
      />
      <span className={defaultSymbolClass}>
        €
      </span>
    </div>
  );
};
