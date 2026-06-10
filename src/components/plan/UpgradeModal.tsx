import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PLAN_LABELS, PLAN_TAGLINES, type PlanType } from '@/lib/featureAccess';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredPlan: PlanType;
  featureLabel?: string;
  description?: string;
}

export function UpgradeModal({
  open,
  onOpenChange,
  requiredPlan,
  featureLabel = 'This feature',
  description = 'Upgrade to access detailed and defendable pricing.',
}: UpgradeModalProps) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            Available on {PLAN_LABELS[requiredPlan]}
          </DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <span className="block">{featureLabel} is part of the {PLAN_LABELS[requiredPlan]} plan.</span>
            <span className="block text-xs italic text-muted-foreground">{PLAN_TAGLINES[requiredPlan]}</span>
            <span className="block">{description}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Maybe later</Button>
          <Button onClick={() => { onOpenChange(false); navigate('/billing'); }}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Upgrade Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}