import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Home() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav />

      {/* Hero */}
      <section className="relative overflow-hidden flex-1">
        {/* Subtle background texture using brand neutrals */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-[#f2f2f2] dark:bg-[#1a1a1a]/40" />
          <div className="absolute top-0 right-0 w-1/2 h-full border-l border-border/30" />
        </div>

        <div className="container relative py-24 md:py-40">
          <div className="max-w-2xl">
            {/* Main headline — Oswald Medium, 90% Black */}
            <h1 className="font-display font-medium text-5xl md:text-7xl uppercase leading-[1.0] tracking-tight mb-6 text-foreground">
              Epipheo's
              <br />
              {/* Aqua accent word per brand type hierarchy */}
              <span className="text-primary">Music</span>
              <br />
              Resource
            </h1>

            {/* Body copy — Noticia Text */}
            <p className="text-base md:text-lg text-muted-foreground max-w-md mb-10 leading-relaxed">
              A curated library of high-quality music tracks for your projects.
              Stream, preview, and download exactly what you need.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/browse">
                {/* Primary CTA — Epipheo Aqua */}
                <Button
                  size="lg"
                  className="gap-2 font-display text-sm tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Browse Music
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {!isAuthenticated && (
                <Link href="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="font-display text-sm tracking-widest uppercase border-foreground/30 hover:border-foreground/60"
                  >
                    Sign in
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
          <img
            src="/manus-storage/epipheo-logo-black-transparent_5380d099.png"
            alt="Epipheo"
            className="h-6 w-auto object-contain dark:hidden opacity-60"
          />
          <img
            src="/manus-storage/epipheo-logo-white-transparent_1da09ee5.png"
            alt="Epipheo"
            className="h-6 w-auto object-contain hidden dark:block opacity-60"
          />
          <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">
            © {new Date().getFullYear()} All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
