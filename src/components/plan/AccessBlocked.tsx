import { Link } from 'react-router-dom';
import { PauseCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface AccessBlockedProps {
  reason: 'paused' | 'canceled' | 'past_due';
  pauseEndsAt?: string | null;
}

export function AccessBlocked({ reason, pauseEndsAt }: AccessBlockedProps) {
  const isPaused = reason === 'paused';
  const isPastDue = reason === 'past_due';

  const icon = isPaused ? (
    <PauseCircle className="h-6 w-6" />
  ) : isPastDue ? (
    <AlertTriangle className="h-6 w-6" />
  ) : (
    <XCircle className="h-6 w-6" />
  );

  const title = isPaused
    ? 'Subscription paused'
    : isPastDue
      ? 'Payment past due'
      : 'Subscription cancelled';

  const description = isPaused
    ? `Access to CPQ is paused${pauseEndsAt ? ` until ${new Date(pauseEndsAt).toLocaleDateString('en-AU')}` : ''}. Your data is preserved.`
    : isPastDue
      ? 'Your latest payment failed. Update your payment method on the Billing page to restore access. Your data is preserved.'
      : 'Your subscription has ended. Your data is preserved — resubscribe to regain access.';

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="pt-1">{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground text-center">
          Manage your subscription on the Billing page.
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild>
            <Link to="/billing">Go to Billing</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
