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
