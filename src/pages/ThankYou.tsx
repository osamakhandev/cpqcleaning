import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Mail } from "lucide-react";

export default function ThankYou() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  useEffect(() => {
    document.title = "Thank you — CPQ";
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-primary" />
          </div>
          <CardTitle className="text-2xl">Your 7-day free trial is starting</CardTitle>
          <CardDescription>Thanks for signing up — we're getting your account ready.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 p-4 rounded-md bg-muted">
            <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Check your email</p>
              <p className="text-muted-foreground">
                We've sent you a link to set your password and access your account.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            You won't be charged for the next 7 days. Cancel anytime from the billing page.
          </p>
          {/* <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => navigate("/auth")}>
              Go to login
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => navigate("/plans")}>
              View plans
            </Button>
          </div> */}
          {sessionId && (
            <p className="text-[10px] text-center text-muted-foreground font-mono break-all">Reference: {sessionId}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
