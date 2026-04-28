import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { PlayerProvider } from "./contexts/PlayerContext";
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
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <CartProvider>
            <PlayerProvider>
              <Toaster position="bottom-right" theme="dark" />
              <Router />
            </PlayerProvider>
          </CartProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
