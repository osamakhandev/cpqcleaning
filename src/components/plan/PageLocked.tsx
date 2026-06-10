import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PLAN_LABELS, PLAN_TAGLINES, type PlanType } from '@/lib/featureAccess';

interface PageLockedProps {
  requiredPlan: PlanType;
  pageLabel?: string;
}

export function PageLocked({ requiredPlan, pageLabel }: PageLockedProps) {
  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle>Available on {PLAN_LABELS[requiredPlan]}</CardTitle>
          <CardDescription className="pt-1">
            <span className="block">{pageLabel ?? 'This page'} is part of the {PLAN_LABELS[requiredPlan]} plan.</span>
            <span className="block text-xs italic mt-1">{PLAN_TAGLINES[requiredPlan]}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground text-center">
          Upgrade your plan to unlock this page and gain access to detailed and defendable pricing.
        </CardContent>
        <CardFooter className="flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/job-details">Back to Job Details</Link>
          </Button>
          <Button asChild>
            <Link to="/billing">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Upgrade Plan
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
