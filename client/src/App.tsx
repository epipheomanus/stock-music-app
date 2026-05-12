import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import GlobalPlayerBar from "./components/GlobalPlayerBar";
import { usePlayer } from "./contexts/PlayerContext";

// Adds bottom padding equal to the player bar height when a track is active
function PlayerPaddingWrapper({ children }: { children: React.ReactNode }) {
  const { activeTrackId, isCollapsed } = usePlayer();
  const paddingBottom = activeTrackId ? (isCollapsed ? 56 : 96) : 0;
  return (
    <div style={{ paddingBottom }} className="transition-[padding] duration-300">
      {children}
    </div>
  );
}

// Toaster that follows the active theme
function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="bottom-right" theme={theme} />;
}

import Home from "./pages/Home";
import Browse from "./pages/Browse";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminTracks from "./pages/admin/Tracks";
import AdminTrackEdit from "./pages/admin/TrackEdit";
import AdminInvites from "./pages/admin/Invites";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminWatermark from "./pages/admin/Watermark";
import AdminUsers from "./pages/admin/Users";
import AdminTaxonomy from "./pages/admin/Taxonomy";
import MyProjects from "./pages/MyProjects";
import ProjectDetail from "./pages/ProjectDetail";
import SharedProject from "./pages/SharedProject";
import Profile from "./pages/Profile";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/tracks" component={AdminTracks} />
      <Route path="/admin/tracks/:id" component={AdminTrackEdit} />
      <Route path="/admin/invites" component={AdminInvites} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/watermark" component={AdminWatermark} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/taxonomy" component={AdminTaxonomy} />
      <Route path="/projects" component={MyProjects} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/shared/:token" component={SharedProject} />
      <Route path="/profile" component={Profile} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <CartProvider>
            <PlayerProvider>
              <ThemedToaster />
              <PlayerPaddingWrapper>
                <Router />
              </PlayerPaddingWrapper>
              <GlobalPlayerBar />
            </PlayerProvider>
          </CartProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
