import React, { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function fmtNum(value: number, decimals?: number): string {
  if (decimals !== undefined) {
    return value.toLocaleString("en-AU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return value.toLocaleString("en-AU");
}

interface FormattedCellInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Number of decimals to show when not focused. Use 0 for integer-like display. Omit for "as-is". */
  decimals?: number;
  /** Allow null when input is cleared (vs. coercing to 0). Default false. */
  allowNull?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Controlled numeric input that displays thousand separators (en-AU) when blurred,
 * and a plain raw number when focused for easy editing. Supports nullable values
 * for OSC-style optional fields.
 */
const FormattedCellInput: React.FC<FormattedCellInputProps> = ({
  value,
  onChange,
  decimals,
  allowNull = false,
  min,
  max,
  placeholder = "",
  disabled = false,
  className,
}) => {
  const [focused, setFocused] = useState(false);
  const [rawText, setRawText] = useState("");

  const displayValue = focused
    ? rawText
    : value == null || value === 0
      ? ""
      : fmtNum(value, decimals);

  const handleFocus = useCallback(() => {
    setFocused(true);
    setRawText(value == null || value === 0 ? "" : String(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      if (text === "" || /^-?\d*\.?\d*$/.test(text)) {
        setRawText(text);
        if (text === "" || text === "-") {
          onChange(allowNull ? null : 0);
        } else {
          const parsed = parseFloat(text);
          if (!isNaN(parsed)) onChange(parsed);
        }
      }
    },
    [onChange, allowNull]
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (rawText === "" || rawText === "-") {
      onChange(allowNull ? null : 0);
      return;
    }
    let parsed = parseFloat(rawText);
    if (isNaN(parsed)) {
      onChange(allowNull ? null : 0);
      return;
    }
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    onChange(parsed);
  }, [rawText, onChange, allowNull, min, max]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(className)}
    />
  );
};

export default FormattedCellInput;
