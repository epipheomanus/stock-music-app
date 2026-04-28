import { Link } from "wouter";
import { Music2, Search, Download, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="container py-24 md:py-36">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Private Music Library
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
              The sound behind
              <br />
              <span className="text-primary">your story.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
              A curated library of high-quality music tracks for your projects.
              Stream, preview, and download exactly what you need.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/browse">
                <Button size="lg" className="gap-2 font-semibold">
                  Browse Music
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {!isAuthenticated && (
                <Link href="/login">
                  <Button size="lg" variant="outline" className="gap-2">
                    Sign in
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/50 py-20">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Play className="h-5 w-5" />}
              title="Stream & Preview"
              description="Listen to every track directly in your browser with an interactive waveform player. No account needed to browse."
            />
            <FeatureCard
              icon={<Search className="h-5 w-5" />}
              title="Powerful Search"
              description="Filter by genre, mood, attributes, composer, and duration simultaneously. Find exactly the right track for any scene."
            />
            <FeatureCard
              icon={<Download className="h-5 w-5" />}
              title="Clean Downloads"
              description="Sign-in members can download full-quality WAV files. Stems included when available, delivered as a tidy ZIP."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      {!isAuthenticated && (
        <section className="border-t border-border/50 py-20">
          <div className="container text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to find your sound?</h2>
            <p className="text-muted-foreground mb-8">
              Browse the full library — no account required to listen and preview.
            </p>
            <Link href="/browse">
              <Button size="lg" className="gap-2">
                Start Browsing
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
              <Music2 className="h-3 w-3 text-primary" />
            </div>
            <span>SoundVault — Private Music Library</span>
          </div>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
