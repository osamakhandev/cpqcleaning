import type { DayCalculation } from '@/types/roster';
import { DAYS_OF_WEEK, DAY_LABELS } from '@/types/roster';
import { cn } from '@/lib/utils';

interface TimelineBarProps {
  calculation: DayCalculation;
  showLabels?: boolean;
  serviceColor?: string;
  showHatch?: boolean;
}

export function TimelineBar({ calculation, showLabels = true, serviceColor, showHatch }: TimelineBarProps) {
  if (!calculation.isValid || calculation.startMin < 0) {
    return (
      <div className="timeline-bar flex items-center justify-center text-xs text-muted-foreground">
        No shift
      </div>
    );
  }

  const { startMin, coverageMin, hasBreak, isUnpaidBreak, breakStartMin, endMin } = calculation;
  // End == 00:00 with start > 0 means same-day 24:00, NOT overnight
  const endsAtMidnightSameDay = endMin === 0 && startMin > 0;
  const isOvernight = endMin < startMin && coverageMin > 0 && !endsAtMidnightSameDay;
  const displayEndMin = isOvernight ? endMin + 1440 : (endsAtMidnightSameDay ? 1440 : endMin);
  const timelineMaxMin = isOvernight ? 1920 : 1440;
  const totalHours = timelineMaxMin / 60;
  const barWidthMin = Math.min(displayEndMin, timelineMaxMin) - startMin;
  
  const startPercent = (startMin / timelineMaxMin) * 100;
  const widthPercent = (barWidthMin / timelineMaxMin) * 100;
  
  const breakDuration = 30;
  const breakStartPercent = hasBreak ? ((breakStartMin - startMin) / barWidthMin) * 100 : 0;
  const breakWidthPercent = hasBreak ? (breakDuration / barWidthMin) * 100 : 0;

  const isNightShift = startMin < 6 * 60 || startMin >= 18 * 60;
  const midnightPercent = isOvernight ? (24 * 60 / timelineMaxMin) * 100 : 0;

  const currentDay = calculation.day;
  const nextDayIndex = (DAYS_OF_WEEK.indexOf(currentDay) + 1) % 7;
  const nextDay = DAYS_OF_WEEK[nextDayIndex];

  return (
    <div className="relative">
      {/* Day labels for overnight */}
      {showLabels && isOvernight && (
        <div className="absolute -top-9 left-0 right-0 flex text-[10px] text-muted-foreground font-medium">
          <span style={{ width: `${midnightPercent}%`, textAlign: 'center' }}>
            {DAY_LABELS[currentDay].slice(0, 3)}
          </span>
          <span style={{ width: `${100 - midnightPercent}%`, textAlign: 'center' }}>
            {DAY_LABELS[nextDay].slice(0, 3)}
          </span>
        </div>
      )}

      {/* Time markers */}
      {showLabels && (
        <div className="absolute -top-5 left-0 right-0 flex justify-between text-[10px] text-muted-foreground">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          {isOvernight ? (
            <>
              <span className="text-destructive font-medium">00:00</span>
              <span>08:00</span>
            </>
          ) : (
            <span>24:00</span>
          )}
        </div>
      )}
      
      <div className="timeline-bar">
        {/* Hourly grid lines */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: totalHours - 1 }, (_, i) => i + 1).map(hour => (
            <div
              key={hour}
              className={cn(
                "absolute h-full w-px",
                hour === 24 ? "bg-destructive/60 z-10" : hour % 2 === 0 ? "bg-border/60" : "bg-border/30"
              )}
              style={{ left: `${(hour / totalHours) * 100}%` }}
            />
          ))}
        </div>

        {/* Midnight marker */}
        {isOvernight && (
          <div
            className="absolute h-full w-0.5 bg-destructive/70 z-10"
            style={{ left: `${midnightPercent}%` }}
            title="Midnight"
          />
        )}

        {/* Shift segment */}
        <div
          className={cn(
            "shift-segment",
            !serviceColor && (isNightShift ? "shift-night" : "shift-day"),
            showHatch && "supervision-hatch"
          )}
          style={{
            left: `${startPercent}%`,
            width: `${widthPercent}%`,
            ...(serviceColor ? { backgroundColor: serviceColor, opacity: isNightShift ? 0.8 : 1 } : {}),
          }}
        >
          {/* Break overlay */}
          {hasBreak && (
            <div
              className={cn(
                "absolute h-full",
                isUnpaidBreak ? "break-unpaid" : "break-paid"
              )}
              style={{
                left: `${breakStartPercent}%`,
                width: `${breakWidthPercent}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      {showLabels && hasBreak && (
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className={cn("w-3 h-2 rounded-sm inline-block", !serviceColor && (isNightShift ? "shift-night" : "shift-day"))}
              style={serviceColor ? { backgroundColor: serviceColor } : undefined}
            />
            Work
          </span>
          <span className="flex items-center gap-1">
            <span className={cn(
              "w-3 h-2 rounded-sm inline-block",
              isUnpaidBreak ? "break-unpaid" : "break-paid"
            )} />
            {isUnpaidBreak ? 'Break (unpaid)' : 'Break (paid)'}
          </span>
        </div>
      )}
    </div>
  );
}
