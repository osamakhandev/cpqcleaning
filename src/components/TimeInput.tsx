import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeTimeValue } from "@/lib/timeUtils";

export interface TimeInputProps extends Omit<React.ComponentPropsWithoutRef<typeof Input>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  autoCalculated?: boolean;
}

export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  (
    {
      value,
      onChange,
      placeholder = "HH:MM",
      disabled = false,
      className,
      autoCalculated = false,
      ...props
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [localValue, setLocalValue] = React.useState(value);

    // Sync local value from parent when not focused
    React.useEffect(() => {
      if (!isFocused) {
        setLocalValue(value);
      }
    }, [value, isFocused]);

    // Display: when focused show raw local value, otherwise show formatted parent value
    const displayValue = isFocused ? localValue : (value ? normalizeTimeValue(value) : value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;

      if (val === "") {
        setLocalValue("");
        onChange(""); // Clear immediately
        return;
      }

      val = val.replace(/[^\d:]/g, "");
      if (val.length > 5) {
        val = val.slice(0, 5);
      }

      setLocalValue(val);
      // Do NOT call onChange here — wait for blur to normalize and push
    };

    const handleFocus = () => {
      setIsFocused(true);
      setLocalValue(value); // Start editing with the current raw value
    };

    const handleBlur = () => {
      setIsFocused(false);
      if (!localValue) {
        // If cleared during editing, ensure parent knows
        if (value !== "") {
          onChange("");
        }
        return;
      }
      const formatted = normalizeTimeValue(localValue);
      // Always push the normalized value to parent on blur
      onChange(formatted);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      }
    };

    return (
      <Input
        ref={ref}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "time-input w-20",
          autoCalculated &&
            "bg-accent/50 border-accent placeholder:text-accent-foreground placeholder:opacity-70",
          className,
        )}
        {...props}
      />
    );
  },
);
TimeInput.displayName = "TimeInput";
