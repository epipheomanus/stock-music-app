import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Music, Users, Download, TrendingUp, Link2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function getCurrentQuarterLabel() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}

function getCurrentYearLabel() {
  return `${new Date().getFullYear()} YTD`;
}

export default function AdminDashboard() {
  const statsQuery = trpc.admin.stats.useQuery();
  const stats = statsQuery.data;

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your Epipheo Music library</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Music className="h-5 w-5" />} label="Total Tracks" value={stats?.totalTracks ?? 0} />
          <StatCard icon={<Users className="h-5 w-5" />} label="Registered Users" value={stats?.totalUsers ?? 0} />
          <StatCard
            icon={<Download className="h-5 w-5" />}
            label={`Quarterly Downloads (${getCurrentQuarterLabel()})`}
            value={stats?.quarterlyDownloads ?? 0}
            sublabel="Clean track downloads only"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label={`Downloads (${getCurrentYearLabel()})`}
            value={stats?.ytdDownloads ?? 0}
            sublabel="Clean track downloads only"
          />
        </div>

        {/* Quick actions */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl border border-border/50 bg-card/50">
            <h2 className="font-semibold mb-1">Add a new track</h2>
            <p className="text-sm text-muted-foreground mb-4">Upload a WAV file and fill in metadata to add it to the library.</p>
            <Link href="/admin/tracks">
              <Button size="sm" className="gap-2">
                <Music className="h-4 w-4" />
                Manage Tracks
              </Button>
            </Link>
          </div>
          <div className="p-5 rounded-xl border border-border/50 bg-card/50">
            <h2 className="font-semibold mb-1">Invite a new user</h2>
            <p className="text-sm text-muted-foreground mb-4">Generate an invite link to allow someone to create an account.</p>
            <Link href="/admin/invites">
              <Button size="sm" variant="outline" className="gap-2">
                <Link2 className="h-4 w-4" />
                Manage Invites
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="p-5 rounded-xl border border-border/50 bg-card/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value.toLocaleString()}</div>
      {sublabel && <p className="text-[11px] text-muted-foreground/60 mt-1">{sublabel}</p>}
    </div>
  );
}
