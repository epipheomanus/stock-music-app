import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Music2, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Register() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", company: "",
    username: "", password: "", confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const validateQuery = trpc.auth.validateInvite.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Account created! Please sign in.");
      navigate("/login");
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Registration failed"),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    registerMutation.mutate({
      token,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      company: form.company || undefined,
      username: form.username,
      password: form.password,
    });
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">No invite link</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Registration requires a valid invite link. Please contact an administrator.
          </p>
          <Link href="/login"><Button variant="outline">Back to Sign in</Button></Link>
        </div>
      </div>
    );
  }

  if (validateQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (validateQuery.isError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Invalid invite</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {validateQuery.error?.message ?? "This invite link is invalid or has expired."}
          </p>
          <Link href="/login"><Button variant="outline">Back to Sign in</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">
            Sound<span className="text-primary">Vault</span>
          </span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-4">
              Invite accepted
            </div>
            <h1 className="text-2xl font-bold mb-2">Create your account</h1>
            <p className="text-sm text-muted-foreground">Fill in your details to get started</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name *</Label>
                <Input id="firstName" name="firstName" placeholder="Jane" value={form.firstName} onChange={handleChange} required className="bg-card border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name *</Label>
                <Input id="lastName" name="lastName" placeholder="Smith" value={form.lastName} onChange={handleChange} required className="bg-card border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address *</Label>
              <Input id="email" name="email" type="email" placeholder="jane@company.com" value={form.email} onChange={handleChange} required className="bg-card border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="company" name="company" placeholder="Acme Inc." value={form.company} onChange={handleChange} className="bg-card border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input id="username" name="username" placeholder="janesmith" value={form.username} onChange={handleChange} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" title="Letters, numbers, and underscores only" className="bg-card border-border" />
              <p className="text-xs text-muted-foreground">Letters, numbers, and underscores only</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Min. 8 characters" value={form.password} onChange={handleChange} required minLength={8} className="bg-card border-border pr-10" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password *</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={handleChange} required className="bg-card border-border" />
            </div>
            <Button type="submit" className="w-full font-semibold mt-2" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating account…</> : "Create account"}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
