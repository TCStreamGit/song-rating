# Song Rating — Discover Ranker

A phone-first PWA for sorting the song currently playing on Spotify out of
`Discover Weekly Archive` and into one of Tanner's rating/category playlists.

## Preconfigured playlists

Source:
- Discover Weekly Archive

Ratings:
- Excellent
- Great
- Good
- Okay (auto-detects if/when a playlist with this exact name exists)
- Average
- Meh

Other destinations:
- Beats
- Leaks
- Already Played
- Chill PlaylistRating

## What one tap does

For a rating button:
1. Reads the track currently playing on Spotify.
2. Verifies it is playing from Discover Weekly Archive (default safety setting).
3. Adds the track to the selected rating playlist.
4. Removes it from the other rating playlists.
5. Removes it from Discover Weekly Archive.
6. Optionally skips to the next track.

For an "Other playlist" button:
1. Adds the current track to that playlist.
2. Removes it from Discover Weekly Archive.
3. Optionally skips next.

"Remove / Don't save" removes the track from Discover Weekly Archive without
adding it elsewhere.

Undo removes the track from the most recent destination and restores it to
Discover Weekly Archive. Undo does not rewind Spotify playback.

## Spotify developer setup

Spotify's current Web API requires a Spotify Premium account.

1. Open https://developer.spotify.com/dashboard and sign in.
2. Create an app.
3. Select **Web API**.
4. Host this folder on an HTTPS website (GitHub Pages, Cloudflare Pages, Netlify,
   Vercel, etc.).
5. Open the hosted Song Rating app.
6. Copy the exact **Redirect URI** shown on its connection screen.
7. In your Spotify developer app settings, add that exact redirect URI.
8. Copy your Spotify **Client ID** (NOT the Client Secret).
9. Paste the Client ID into Song Rating and tap **Connect Spotify**.
10. Approve the requested Spotify permissions.

The app uses Authorization Code with PKCE. The Client Secret is not used or
stored. Access and refresh tokens are stored locally in that browser so the
Home Screen app can stay signed in.

## Install on iPhone

After the hosted app is working in Safari:
1. Tap Safari's Share button.
2. Tap **Add to Home Screen**.
3. Name it `Song Rating`.
4. Open it from the Home Screen.

## Safety

`Require Archive playback` is enabled by default. This prevents you from
accidentally ranking an unrelated song if Spotify is playing from another
playlist, album, or context.

## Files

- `index.html` — app UI
- `style.css` — iPhone-first design
- `app.js` — Spotify PKCE + ranking logic
- `manifest.webmanifest` — installable PWA metadata
- `service-worker.js` — offline shell caching
- `icon-*.png` — Home Screen/app icons
