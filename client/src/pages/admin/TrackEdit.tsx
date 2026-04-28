import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

// Track editing is handled via dialog on the Tracks page
// This route redirects back to the tracks list
export default function AdminTrackEdit() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    navigate("/admin/tracks");
  }, [navigate]);

  return null;
}
