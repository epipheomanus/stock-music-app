import { Link } from "wouter";
import { Music2, ArrowRight } from "lucide-react";
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
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
              Epipheo's
              <br />
              <span className="text-primary">Music Resource</span>
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
      {/* Footer */}
      <footer className="border-t border-border/50 py-8 mt-auto">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
              <Music2 className="h-3 w-3 text-primary" />
            </div>
            <span>Epipheo Music</span>
          </div>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
