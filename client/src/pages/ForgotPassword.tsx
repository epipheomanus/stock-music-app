import { useState } from "react";
import { Link } from "wouter";
import { Music2, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const forgotMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err: { message?: string }) => toast.error(err.message || "Something went wrong"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    forgotMutation.mutate({ email, origin: window.location.origin });
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">
            Epipheo Music
          </span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {submitted ? (
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h1 className="text-xl font-bold mb-2">Check your email</h1>
              <p className="text-sm text-muted-foreground mb-6">
                If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
              </p>
              <Link href="/login"><Button variant="outline" className="w-full">Back to Sign in</Button></Link>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-2">Reset password</h1>
                <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="bg-card border-border" />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={forgotMutation.isPending}>
                  {forgotMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</> : "Send reset link"}
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground mt-6">
                Remembered it?{" "}
                <Link href="/login" className="text-primary hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
