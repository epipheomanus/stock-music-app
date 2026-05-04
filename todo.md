# SoundVault TODO

## Database & Schema
- [x] Extend users table with firstName, lastName, company, username fields
- [x] Create invites table (token, createdBy, usedBy, expiresAt)
- [x] Create tracks table (title, composerName, duration, wavKey, stemsZipKey, watermarkedMp3Key, coverArtKey, bpm, description)
- [x] Create track_tags table (trackId, type: genre|mood|attribute, value)
- [x] Create cart_items table (userId, trackId)
- [x] Create downloads table (userId, trackId, projectName, downloadedAt)
- [x] Create watermark_config table (audioKey, updatedAt)
- [x] Run migrations

## Backend API
- [x] Invite generation procedure (admin only)
- [x] Invite validation procedure (public)
- [x] User registration with invite token procedure
- [x] Forgot password flow (token generation + reset)
- [x] Track CRUD procedures (admin: create, update, delete; public: list, get)
- [x] Tag management procedures (admin: add/remove tags per track)
- [x] Multi-select filter/search procedure (genre, mood, attributes, composer, duration)
- [x] Cart procedures (add, remove, list, clear)
- [x] Checkout/download procedure (log download, return signed URLs, zip if stems)
- [x] Watermark config upload procedure (admin)
- [x] Watermark generation pipeline (ffmpeg overlay every 10s → MP3)
- [x] Admin download analytics procedure
- [x] Watermarked track download (public, no login required)
- [x] Clean WAV download (protected, login required)
- [x] File upload REST routes (multer: WAV + stems + cover art + watermark)

## Frontend – Public Browse
- [x] Global top navigation (logo, Browse link, cart icon, user dropdown)
- [x] Track listing page with waveform player per track
- [x] WaveSurfer.js waveform with play/pause, seek, duration display
- [x] Multi-select filter sidebar (genre, mood, attributes)
- [x] Filter chips showing active selections
- [x] Watermarked download button per track (public access)
- [x] Add to cart button per track (login required)

## Frontend – Auth Pages
- [x] Login page (email/username + password, forgot password link)
- [x] Register page (invite token required, firstName, lastName, email, company optional, username, password)
- [x] Forgot password page (enter email)
- [x] Reset password page (token from email)

## Frontend – Cart & Download
- [x] Cart sidebar/drawer (list items, remove, checkout button)
- [x] Checkout modal (project name field)
- [x] Legal disclaimer modal (must confirm before download)
- [x] Download handler (single WAV or ZIP with stems)

## Admin Dashboard
- [x] Admin-only route guard
- [x] Track upload form (WAV mixdown + optional stems folder/zip)
- [x] Track metadata form (title, composer, genre, mood, attributes, duration, cover art)
- [x] Watermark audio upload and management
- [x] Invite link generator (copy to clipboard)
- [x] Track list management (edit, delete)
- [x] Download analytics table (user, track, project, date)

## Testing
- [x] Vitest: auth.me and auth.logout
- [x] Vitest: tracks.list and tracks.filterOptions
- [x] Vitest: admin guard (rejects non-admin)
- [x] Vitest: cart add/remove/list (protected)
- [x] Vitest: downloads.checkout (validation, logging)
- [x] Vitest: watermark.getConfig (admin only)

## Future / Pending
- [x] Legal disclaimer text — placeholder in place; replace with final legal language when provided by client
- [x] Logo and brand colors — placeholder SoundVault branding in place; update when assets are provided by client
- [x] Email delivery for forgot-password — reset token returned in API response; admin can share link manually until email service is configured

## Round 2 Improvements (User Feedback)

- [x] Lighten color scheme — replace dark black/blue with a softer, lighter palette
- [x] Drag-and-drop file upload for WAV Mixdown and Stems Folder in admin track upload
- [x] Separate tag fields: Genre, Mood, Attributes (instead of one combined field)
- [x] Saved tag history — previously used tags shown as semi-transparent buttons with X to delete
- [x] Auto-populate track title from uploaded WAV filename (strip file extension)
- [x] Fix watermark pipeline error on track upload
- [x] Add "Download Watermarked Version" button next to each track on Browse page
- [x] Post-download navigation: "Back to Music Browsing" and "Back to Home Page" buttons
- [x] Admin: User Account Management panel — show new account registrations, lock/unlock accounts
- [x] Admin: Download report export to CSV/Google Sheets format (Name, Song, Date, Project Name)

## Round 3 Improvements
- [x] Persistent bottom playback bar (slides up when a track starts playing, persists across page navigation)
- [x] Playback bar: track title, composer, waveform progress, play/pause, seek, time display, Add to Cart, Preview (watermarked) download

## Round 4 Improvements
- [x] Volume control slider in bottom playback bar
- [x] Previous and Next track buttons in bottom playback bar
- [x] Collapsible bottom playback bar (minimize to save screen space)
- [x] Retry Watermark button in admin Tracks page for tracks stuck on WM Error

## Round 5 Improvements
- [x] Fix watermark generation pipeline errors (investigate ffmpeg/storage issue)
- [x] Add sort-by-date to Browse page (newest first / oldest first toggle)

## Round 6 Improvements
- [x] Multi-word tag search: searching "Orchestral romantic soft" returns tracks tagged with ALL those words
- [x] Fixed tag taxonomy dropdown bar on Browse page (Genre / Mood / Attributes with preset tags)
- [x] Hidden tags field in admin track create/edit form (custom tags invisible to users but searchable)
- [x] DB migration: add hiddenTags column to track_tags table (type = "hidden")

## Round 7 Improvements
- [x] Fix multi-word search: typing "Orchestral Romantic Soft" must require ALL three tags to be present on a track
- [x] Replace dynamic "previously used tags" suggestions in admin form with fixed taxonomy lists (same as Browse dropdowns)

## Round 8 Improvements
- [x] Fix "Watermarked version not available yet" error on Browse page
- [x] Fix watermark pipeline 403 error when downloading WAV/watermark audio from storage

## Round 9 Improvements
- [x] Rebrand: change "SoundVault" to "Epipheo Music" throughout the app
- [x] Homepage: change headline to "Epipheo's Music Resource"
- [x] Homepage: remove "Private Music Library" badge and three feature boxes
- [x] Browse page: add alphabetical A-Z / Z-A sort options
- [x] Admin: taxonomy editor page to add/remove Genre, Mood, Attribute tags

## Round 10 Improvements
- [x] Fix broken track playback on Browse page (tracks no longer play)
- [x] Verify bottom playback bar features: volume slider, prev/next, collapse

## Round 11 Improvements
- [x] Confirm invite one-time-use security (already implemented — verified: usedById check prevents reuse)
- [x] Add admin-role invite option in admin Invites page (User/Admin toggle, role applied on registration)
- [x] Wire Resend for forgot-password email delivery (API key validated, reset email sent via Resend)

## Round 12 Bug Fixes
- [x] Fix TypeError: Cannot read properties of null (reading 'toLowerCase') on /admin/analytics page

## Round 13 Improvements
- [x] Browse page: play clean audio on waveform, keep watermarked file for Download Preview button

## Round 14 Improvements
- [x] Set RESEND_FROM to noreply@epipheo.com for verified domain email delivery (pending DNS verification of epipheo.com in Resend)
- [x] Update forgot-password email template with Epipheo Music branding
## Round 15 Improvements
- [x] Add tracks.retryAllStuck admin tRPC procedure (queries all pending/error tracks, queues watermark generation for each, returns count)
- [x] Add "Retry All Stuck (N)" button to admin Tracks page (amber styling, only visible when stuck tracks exist, invalidates list on success)

## Round 16 Improvements
- [x] Add deleteUser DB helper (cascades: cart_items, downloads, invites created by user)
- [x] Add admin tRPC procedure users.delete (prevents deleting own account or other admins)
- [x] Add "Remove User" button to admin Users page (red destructive style, confirmation dialog, disabled for own account)

## Round 17 — Epipheo Branding
- [x] Extract Epipheo logo from brand PDF (black + white transparent PNG variants)
- [x] Upload logo variants as webdev static assets
- [x] Add Oswald + Noticia Text Google Fonts to index.html
- [x] Rewrite index.css with Epipheo color palette (Aqua #33ebc6 primary, Orange #ff6340 destructive, neutral-dominant backgrounds)
- [x] Update TopNav to use Epipheo logo image (dark/light variants)
- [x] Update Home page hero with Oswald headings, Aqua accent, brand tagline, Epipheo logo in footer
- [x] Update AdminLayout sidebar to use Epipheo logo image

## Round 19
- [x] Persist admin Tracks sort/filter state to localStorage (survives navigation away and back)
- [x] Enable watermarked preview player on public /share/:token page (no login required)

## Round 20
- [x] Fix Add-to-Project greyed-out bug in Browse (project names disabled, cannot add track)
- [x] Add download count badge per track in admin Tracks list
- [x] Add Most Downloaded > Least Downloaded and Least Downloaded > Most Downloaded sort options to admin Tracks

## Round 21
- [x] Fix playlist "unknown track" bug on My Projects detail page (tracks show as Unknown and won't play)
- [x] Add date range filter (start date, end date) to admin Downloads CSV export (quarterly/annual use)
- [x] Update home page subtitle copy

## Round 22
- [x] Update checkout legal disclaimer to new Epipheo-specific language (4 numbered clauses + confirmation prompt)
- [x] Add cart buttons to playlist track rows in ProjectDetail page
- [x] Add cart buttons to playlist track rows in SharedProject page (only when user is logged in)
- [x] Add pagination to Browse page (10/25/50 per page, default 25, page numbers at bottom)
- [x] Add pagination to admin Track Manager (10/25/50 per page, default 25, page numbers at bottom)

## Round 30 — UI/UX Improvements

- [x] Make composer a required field in admin track form (Add Track + Edit Track dialogs)
- [x] Add "Popularity" sort option to Browse page sort dropdown (based on clean download count)
- [x] Persist Browse sort order to localStorage so it survives page refreshes
- [x] Scroll to top of page when changing pages in the Browse track browser
- [x] Add drag-to-reorder on playlist tracks in My Projects

## Round 31 — MP3 Preview Pipeline

- [x] Add mp3PreviewKey + mp3PreviewUrl columns to tracks table in schema
- [x] Add generateMp3Preview() to watermark.ts (192kbps MP3 from 24-bit WAV)
- [x] Update single-track upload handler to generate mp3PreviewUrl
- [x] Update generateWatermark procedure to generate mp3PreviewUrl
- [x] Update retryAllStuck procedure to generate mp3PreviewUrl
- [x] Update bulkImport endpoint to generate mp3PreviewUrl
- [x] Update WaveformPlayer to use mp3PreviewUrl for WaveSurfer playback
- [x] Update PlayerContext/GlobalPlayerBar to use mp3PreviewUrl for playback
- [x] Bulk-convert all 200 existing tracks to MP3 preview
- [x] Ensure downloads still serve originalWavUrl (24-bit)

## Round 32 — Admin Track Manager Improvements

- [x] Add Published/Unpublished filter dropdown to Admin Track Manager filter panel
- [x] Add "Reset download preference" link in user account/profile page so users who checked "Do not show again" can re-enable the watermark confirmation dialog

## Round 33 — My Profile Page

- [x] Add updateProfile tRPC procedure (firstName, lastName, company, username fields)
- [x] Add myDownloads tRPC procedure (returns user's clean download history with track info)
- [x] Create /profile page with personal info edit form
- [x] Add clean download history table to profile page
- [x] Add download preference (reset watermark dialog) section to profile page
- [x] Add "My Profile" link to user dropdown in TopNav
- [x] Remove "Reset download prompt" from TopNav dropdown (moved to profile page)
- [x] Register /profile route in App.tsx

## Round 34 — My Profile Page Improvements

- [x] Remove username field from profile personal info form
- [x] Add read-only Role field to profile personal info form
- [x] Replace watermark preference badge with a toggle switch (on = prompt active, off = prompt skipped)
- [x] Update preference section body copy to describe the toggle behavior
- [x] Add change password section to profile page (current password, new password, confirm)
- [x] Add changePassword tRPC procedure (verify current password, hash and save new one)

## Round 35 — User Job Title Field

- [x] Add jobTitle varchar column to users table in drizzle/schema.ts
- [x] Generate and apply DB migration
- [x] Update upsertUser to handle jobTitle field
- [x] Add jobTitle to updateProfile tRPC input schema
- [x] Replace read-only Role badge on profile page with editable jobTitle text input

## Round 36 — Public Project/Playlist Preview Downloads

- [x] Remove "All previews are watermarked." text from public project view
- [x] Add watermarked preview download button to each track row in playlist view
- [x] Guests (not signed in) always see the watermark confirmation dialog before downloading
- [x] Logged-in users follow their skipWatermarkConfirm preference
- [x] No "do not show again" option shown to guests (confirmation always appears)

## Round 37 — Watermarked Preview Filename

- [x] Append "-Preview" to the filename of all watermarked preview downloads (Browse, SharedProject, GlobalPlayerBar)

## Round 38 — Waveform Color + Duration Filter

- [x] Change waveform playback progress color to match the primary green (same as volume slider)
- [x] Add min/max track duration range slider to Browse page filter panel
- [x] Wire duration filter to filter the displayed tracks client-side

## Round 39 — Persist Duration Filter

- [x] Persist Browse page duration range filter to localStorage (read on mount, write on change)
