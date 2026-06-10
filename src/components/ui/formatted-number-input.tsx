import React, { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Format a number with thousand separators (en-AU locale). */
function fmtNum(value: number, decimals?: number): string {
  if (decimals !== undefined) {
    return value.toLocaleString("en-AU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return value.toLocaleString("en-AU");
}

interface FormattedNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  onBlur?: (value: number) => void;
  decimals?: number;
  step?: string;
  min?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  onBlur,
  decimals,
  step = "any",
  min,
  placeholder = "0",
  disabled = false,
  className,
}) => {
  const [focused, setFocused] = useState(false);
  const [rawText, setRawText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = focused
    ? rawText
    : value === 0 && placeholder
      ? ""
      : fmtNum(value, decimals);

  const handleFocus = useCallback(() => {
    setFocused(true);
    setRawText(value === 0 ? "" : String(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      if (text === "" || /^-?\d*\.?\d*$/.test(text)) {
        setRawText(text);
        const parsed = parseFloat(text);
        if (!isNaN(parsed)) {
          onChange(parsed);
        } else if (text === "" || text === "-") {
          onChange(0);
        }
      }
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parseFloat(rawText) || 0;
    onChange(parsed);
    onBlur?.(parsed);
  }, [rawText, onChange, onBlur]);

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      step={step}
      min={min}
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

export default FormattedNumberInput;
