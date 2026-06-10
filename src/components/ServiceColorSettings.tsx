import { Palette, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { SERVICE_LABELS } from '@/types/roster';
import type { ServiceType } from '@/types/roster';
import { useServiceColors } from '@/lib/serviceColors';

export function ServiceColorSettings() {
  const { colors, setColor, resetColors } = useServiceColors();

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" />
              Graph Colour Settings
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Choose colours for each service. Applied to all timeline bars and coverage graphs.
              Operators with a Supervision/Leading Hand allowance show a diagonal hatch overlay.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(Object.keys(SERVICE_LABELS) as ServiceType[]).map(service => (
                <div key={service} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors[service]}
                    onChange={e => setColor(service, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border"
                  />
                  <Label className="text-sm">{SERVICE_LABELS[service]}</Label>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-2">
                <span className="w-6 h-4 rounded-sm supervision-hatch" style={{ backgroundColor: '#2b9a9a' }} />
                Supervision / Leading Hand
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={resetColors}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset to Defaults
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
