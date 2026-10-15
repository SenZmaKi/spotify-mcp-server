<div align="center" style="display: flex; align-items: center; justify-content: center; gap: 10px;">
<img src="https://upload.wikimedia.org/wikipedia/commons/8/84/Spotify_icon.svg" width="30" height="30">
<h1>Spotify MCP Server</h1>
</div>

A lightweight [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that enables AI assistants like Cursor & Claude to control Spotify playback and manage playlists.



## Example Interactions

- _"Play Elvis's first song"_
- _"Create a Taylor Swift / Slipknot fusion playlist"_
- _"Copy all the techno tracks from my workout playlist to my work playlist"_
- _"Turn the volume down a bit"_

## Tools

### Read Operations

1. **searchSpotify**

   - **Description**: Search for tracks, albums, artists, or playlists on Spotify
   - **Parameters**:
     - `query` (string): The search term
     - `type` (string): Type of item to search for (track, album, artist, playlist)
     - `limit` (number, optional): Maximum number of results to return (1-10, default: 10)
     - `offset` (number, optional): Index of the first result to return (default: 0)
   - **Returns**: List of matching items with their IDs, names, and additional details
   - **Example**: `searchSpotify("bohemian rhapsody", "track", 10)`

2. **getNowPlaying**

   - **Description**: Get information about the currently playing track on Spotify, including device and volume info
   - **Parameters**: None
   - **Returns**: Object containing track name, artist, album, playback progress, duration, playback state, device info, volume, and shuffle/repeat status
   - **Example**: `getNowPlaying()`

3. **getMyPlaylists**

   - **Description**: Get a list of the current user's playlists on Spotify
   - **Parameters**:
     - `limit` (number, optional): Maximum number of playlists to return (default: 20)
     - `offset` (number, optional): Index of the first playlist to return (default: 0)
   - **Returns**: Array of playlists with their IDs, names, track counts, and public status
   - **Example**: `getMyPlaylists(10, 0)`

4. **getPlaylistTracks**

   - **Description**: Get a list of tracks in a specific Spotify playlist
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `limit` (number, optional): Maximum number of tracks to return (default: 100)
     - `offset` (number, optional): Index of the first track to return (default: 0)
   - **Returns**: Array of tracks with their IDs, names, artists, album, duration, and added date
   - **Example**: `getPlaylistTracks("37i9dQZEVXcJZyENOWUFo7")`

5. **getRecentlyPlayed**

   - **Description**: Retrieves a list of recently played tracks from Spotify.
   - **Parameters**:
     - `limit` (number, optional): A number specifying the maximum number of tracks to return.
   - **Returns**: If tracks are found it returns a formatted list of recently played tracks else a message stating: "You don't have any recently played tracks on Spotify".
   - **Example**: `getRecentlyPlayed({ limit: 10 })`

6. **getUsersSavedTracks**

   - **Description**: Get a list of tracks saved in the user's "Liked Songs" library
   - **Parameters**:
     - `limit` (number, optional): Maximum number of tracks to return (1-50, default: 50)
     - `offset` (number, optional): Offset for pagination (0-based index, default: 0)
   - **Returns**: Formatted list of saved tracks with track names, artists, duration, track IDs, and when they were added to Liked Songs. Shows pagination info (e.g., "1-20 of 150").
   - **Example**: `getUsersSavedTracks({ limit: 20, offset: 0 })`

7. **getQueue**

   - **Description**: Get the currently playing track and upcoming items in the Spotify queue
   - **Parameters**:
     - `limit` (number, optional): Maximum number of upcoming items to show (1-50, default: 10)
   - **Returns**: Currently playing track and list of upcoming tracks in the queue
   - **Example**: `getQueue({ limit: 20 })`

8. **getAvailableDevices**

   - **Description**: Get information about the user's available Spotify Connect devices
   - **Parameters**: None
   - **Returns**: List of available devices with name, type, active status, volume, and device ID
   - **Example**: `getAvailableDevices()`

9. **removeUsersSavedTracks**

   - **Description**: Remove one or more tracks from the user's "Liked Songs" library (max 40 per request)
   - **Parameters**:
     - `trackIds` (array): Array of Spotify track IDs to remove (max 40)
   - **Returns**: Success confirmation message
   - **Example**: `removeUsersSavedTracks({ trackIds: ["4iV5W9uYEdYUVa79Axb7Rh", "1301WleyT98MSxVHPZCA6M"] })`

10. **getFollowedArtists**

    - **Description**: Get the artists the current user follows
    - **Parameters**:
      - `limit` (number, optional): Maximum number of artists to return (1-50, default: 20)
      - `after` (string, optional): Cursor from a previous call (the last artist ID) to fetch the next page
    - **Returns**: Formatted list of followed artists with names and IDs (plus popularity and genres when Spotify provides them), and a cursor for the next page when more remain
    - **Example**: `getFollowedArtists({ limit: 50 })`


### Play / Create Operations

1. **playMusic**

   - **Description**: Start playing a track, album, artist, or playlist on Spotify
   - **Parameters**:
     - `uri` (string, optional): Spotify URI of the item to play (overrides type and id)
     - `type` (string, optional): Type of item to play (track, album, artist, playlist)
     - `id` (string, optional): Spotify ID of the item to play
     - `deviceId` (string, optional): ID of the device to play on
   - **Returns**: Success status
   - **Example**: `playMusic({ uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" })`
   - **Alternative**: `playMusic({ type: "track", id: "6rqhFgbbKwnb9MLmUQDhG6" })`

2. **pausePlayback**

   - **Description**: Pause the currently playing track on Spotify
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device to pause
   - **Returns**: Success status
   - **Example**: `pausePlayback()`

3. **resumePlayback**

   - **Description**: Resume Spotify playback on the active device
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device to resume playback on
   - **Returns**: Success status
   - **Example**: `resumePlayback()`

4. **skipToNext**

   - **Description**: Skip to the next track in the current playback queue
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device
   - **Returns**: Success status
   - **Example**: `skipToNext()`

5. **skipToPrevious**

   - **Description**: Skip to the previous track in the current playback queue
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device
   - **Returns**: Success status
   - **Example**: `skipToPrevious()`

6. **createPlaylist**

   - **Description**: Create a new playlist on Spotify
   - **Parameters**:
     - `name` (string): Name for the new playlist
     - `description` (string, optional): Description for the playlist
     - `public` (boolean, optional): Whether the playlist should be public (default: false)
   - **Returns**: Object with the new playlist's ID and URL
   - **Example**: `createPlaylist({ name: "Workout Mix", description: "Songs to get pumped up", public: false })`

7. **addTracksToPlaylist**

   - **Description**: Add tracks to an existing Spotify playlist
   - **Parameters**:
     - `playlistId` (string): ID of the playlist
     - `trackUris` (array): Array of track URIs or IDs to add
     - `position` (number, optional): Position to insert tracks
   - **Returns**: Success status and snapshot ID
   - **Example**: `addTracksToPlaylist({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", trackUris: ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"] })`

8. **addToQueue**

   - **Description**: Adds a track, album, artist or playlist to the current playback queue
   - **Parameters**:
     - `uri` (string, optional): Spotify URI of the item to add to queue (overrides type and id)
     - `type` (string, optional): Type of item to queue (track, album, artist, playlist)
     - `id` (string, optional): Spotify ID of the item to queue
     - `deviceId` (string, optional): ID of the device to queue on
   - **Returns**: Success status
   - **Example**: `addToQueue({ uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" })`
   - **Alternative**: `addToQueue({ type: "track", id: "6rqhFgbbKwnb9MLmUQDhG6" })`

9. **setVolume**

   - **Description**: Set the playback volume to a specific percentage (requires Spotify Premium)
   - **Parameters**:
     - `volumePercent` (number): The volume to set (0-100)
     - `deviceId` (string, optional): ID of the device to set volume on
   - **Returns**: Success status with the new volume level
   - **Example**: `setVolume({ volumePercent: 50 })`

10. **adjustVolume**

   - **Description**: Adjust the playback volume up or down by a relative amount (requires Spotify Premium)
   - **Parameters**:
     - `adjustment` (number): The amount to adjust volume by (-100 to 100). Positive values increase volume, negative values decrease it.
     - `deviceId` (string, optional): ID of the device to adjust volume on
   - **Returns**: Success status showing the volume change (e.g., "Volume increased from 50% to 60%")
   - **Example**: `adjustVolume({ adjustment: 10 })` (increase by 10%)
   - **Example**: `adjustVolume({ adjustment: -20 })` (decrease by 20%)


### Album Operations

1. **getAlbums**

   - **Description**: Get detailed information about one or more albums by their Spotify IDs
   - **Parameters**:
     - `albumIds` (string|array): A single album ID or array of album IDs (max 20)
   - **Returns**: Album details including name, artists, release date, type, total tracks, and ID. For single album returns detailed view, for multiple albums returns summary list.
   - **Example**: `getAlbums("4aawyAB9vmqN3uQ7FjRGTy")` or `getAlbums(["4aawyAB9vmqN3uQ7FjRGTy", "1DFixLWuPkv3KT3TnV35m3"])`

2. **getAlbumTracks**

   - **Description**: Get tracks from a specific album with pagination support
   - **Parameters**:
     - `albumId` (string): The Spotify ID of the album
     - `limit` (number, optional): Maximum number of tracks to return (1-50)
     - `offset` (number, optional): Offset for pagination (0-based index)
   - **Returns**: List of tracks from the album with track names, artists, duration, and IDs. Shows pagination info.
   - **Example**: `getAlbumTracks("4aawyAB9vmqN3uQ7FjRGTy", 10, 0)`

3. **saveOrRemoveAlbumForUser**

   - **Description**: Save or remove albums from the user's "Your Music" library
   - **Parameters**:
     - `albumIds` (array): Array of Spotify album IDs (max 20)
     - `action` (string): Action to perform: "save" or "remove"
   - **Returns**: Success status with confirmation message
   - **Example**: `saveOrRemoveAlbumForUser(["4aawyAB9vmqN3uQ7FjRGTy"], "save")`

4. **checkUsersSavedAlbums**

   - **Description**: Check if albums are saved in the user's "Your Music" library
   - **Parameters**:
     - `albumIds` (array): Array of Spotify album IDs to check (max 20)
   - **Returns**: Status of each album (saved or not saved)
   - **Example**: `checkUsersSavedAlbums(["4aawyAB9vmqN3uQ7FjRGTy", "1DFixLWuPkv3KT3TnV35m3"])`

### Playlist Operations

1. **getPlaylist**

   - **Description**: Get details of a specific Spotify playlist including tracks count, description and owner
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
   - **Returns**: Playlist name, owner, track count, visibility, description, ID, and URL
   - **Example**: `getPlaylist({ playlistId: "37i9dQZEVXcJZyENOWUFo7" })`

2. **updatePlaylist**

   - **Description**: Update the details of a Spotify playlist (name, description, public/private, collaborative)
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `name` (string, optional): New name for the playlist
     - `description` (string, optional): New description for the playlist
     - `public` (boolean, optional): Whether the playlist should be public
     - `collaborative` (boolean, optional): Whether the playlist should be collaborative (requires public to be false)
   - **Returns**: Success confirmation with list of updated fields
   - **Example**: `updatePlaylist({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", name: "New Name", public: true })`

3. **removeTracksFromPlaylist**

   - **Description**: Remove one or more tracks from a Spotify playlist (max 100 tracks per request)
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `trackIds` (array): Array of Spotify track IDs to remove (max 100)
     - `snapshotId` (string, optional): The playlist snapshot ID to target a specific version
   - **Returns**: Success confirmation with the number of tracks removed
   - **Example**: `removeTracksFromPlaylist({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", trackIds: ["4iV5W9uYEdYUVa79Axb7Rh"] })`

4. **reorderPlaylistItems**

   - **Description**: Reorder a range of tracks within a Spotify playlist by moving them to a new position
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `rangeStart` (number): The position of the first item to move (0-based index)
     - `insertBefore` (number): The position where the items should be inserted (0-based index)
     - `rangeLength` (number, optional): Number of consecutive items to move (defaults to 1)
     - `snapshotId` (string, optional): The playlist snapshot ID to target a specific version
   - **Returns**: Success confirmation with the move details
   - **Example**: `reorderPlaylistItems({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", rangeStart: 2, insertBefore: 0 })`

## Setup

Run one instance on your server behind an HTTPS reverse proxy. MCP clients use
Streamable HTTP at `https://spotify.example.com/mcp` and send:

```http
Authorization: Bearer YOUR_MCP_API_TOKEN
```

The MCP token is your own secret, not a Spotify token. It grants access to all
Spotify tools. Clients must support custom authorization headers. Change the
server token and restart to revoke access; update each client afterwards.

### Spotify app

1. Sign in at https://developer.spotify.com/dashboard and create an app using
   the Web API. Copy its client ID and client secret into your server environment.
2. Register exactly `https://spotify.example.com/callback` as a redirect URI,
   substituting your actual domain. Set `SPOTIFY_REDIRECT_URI` to the same value.
3. For local development, register `http://127.0.0.1:3000/callback` instead.
   Spotify requires HTTPS except for literal loopback IP addresses; do not use
   `localhost`. See [Spotify redirect rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
4. Use a Spotify Premium account. Check your app's User Management settings and
   allowlist your account if required by Development Mode.
5. Optionally set `SPOTIFY_USER_ID` to your Spotify account ID to reject connections
   to other accounts. This is the ID in your Spotify profile URL, not your display name.

Separate apps named Spotify MCP Dev and Spotify MCP Prod are recommended to
isolate credentials and revocation, but one app can have both redirect URIs.
Hosting on Hetzner does not require Spotify extended quota mode: a personal
single-user deployment can remain in Development Mode, subject to Spotify's
[current eligibility and limits](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
Use different MCP tokens and token files/volumes for each environment regardless.

### Hetzner / Docker

Copy `.env.example` to `.env`, fill in the Spotify values, and generate a secret:

```bash
openssl rand -hex 32
```

Set that result as `MCP_API_TOKEN`, then run:

```bash
docker compose up -d --build
```

Configure your reverse proxy to forward your HTTPS domain to
`127.0.0.1:3000`, including the Authorization header and streaming responses.
If your proxy runs in another container, join a shared Docker network and forward
to `spotify-mcp:3000` instead. Only the HTTPS proxy should be publicly exposed.
The `/health` endpoint is a process health check, not a Spotify connectivity check.

Open `https://spotify.example.com/`, enter your MCP token in the password field,
and click Connect Spotify. Authorize Spotify in the browser. No `npm run auth`
or local callback server is needed. The browser sends the secret in a POST body,
never in the URL; it is not stored in a browser session. Login state expires after
10 minutes and is discarded on server restart. Start again if interrupted.

Spotify access/refresh tokens are saved in `/app/data/spotify-tokens.json` on the
Docker volume, with owner-only permissions and atomic replacement. Client ID and
secret come exclusively from environment variables; `spotify-config.json` is no
longer read. Tokens refresh automatically. Reconnect through the website if
Spotify revokes authorization. Run one replica against the token file.
Do not delete the volume unless you intend to reconnect Spotify.

### Dokploy CI/CD

The GitHub Actions workflow runs lint, type checking, and tests before building
and pushing a `linux/amd64` image to `ghcr.io/senzmaki/spotify-mcp-server` with
`latest` and commit tags. Pushes to `main` and manual workflow runs on `main`
then trigger Dokploy through `SenZmaKi/dokploy-sentry`, which waits for deployment
completion. Pull requests run checks only.

Repository Actions secrets:

- `DOKPLOY_URL`: `https://dokploy.phidel.dev`
- `DOKPLOY_API_KEY`: configured directly in GitHub Secrets, never in this repo
- `DOKPLOY_APP_ID`: the Spotify MCP `server` application's ID

The configured Dokploy project is **Spotify MCP**, environment **production**,
application **server**. It pulls `ghcr.io/senzmaki/spotify-mcp-server:latest`, runs
one replica, mounts the `spotify-mcp-data` volume at `/app/data`, and checks
`/health`. Its HTTPS domain is `spotify-mcp.phidel.dev` on container port 3000.
Dokploy routes directly to the application; it does not use the local Compose
file or its host port mapping.

Before the first deployment:

1. Point DNS for `spotify-mcp.phidel.dev` to your Dokploy server and remove
   conflicting A/AAAA records. Dokploy manages the Let's Encrypt certificate.
2. In the application's Environment settings, fill in `SPOTIFY_CLIENT_ID` and
   `SPOTIFY_CLIENT_SECRET`. The callback is already configured as
   `https://spotify-mcp.phidel.dev/callback`; register that exact URI with Spotify.
   Optionally fill in `SPOTIFY_USER_ID`.
3. `MCP_API_TOKEN` was generated directly in Dokploy. Retrieve it from the
   application's Environment settings for the website and MCP client settings.
4. Ensure the GHCR package is public after its first publication, or configure
   Dokploy's Docker provider with registry credentials granting `read:packages`.
   A public GitHub repository does not automatically make a new GHCR package public.
5. Push the changes to `main` to run CI/CD. If the initial deployment cannot pull
   the image, fix package access and rerun the deployment job. Open the website
   and connect Spotify once the application is running.

Spotify and MCP credentials belong in the Dokploy runtime environment, not in
Docker build arguments or GitHub workflow source. Preserve the token volume
across redeployments.

### Local development

Use a separate `.env.dev` with the same variables, setting:

```dotenv
MCP_HTTP_HOST=127.0.0.1
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
SPOTIFY_TOKEN_FILE=./data/dev-tokens.json
```

```bash
npm ci
npm run build
node --env-file=.env.dev build/index.js
```

Open `http://127.0.0.1:3000/` to connect. Environment files are loaded by Node's
`--env-file` flag or Docker Compose, not automatically by the application.
Legacy `MCP_AUTH=spotify` client-managed Spotify authentication remains available,
but cannot be combined with `MCP_API_TOKEN`. The Docker default is token mode.
Unauthenticated HTTP is restricted to loopback bindings.

## Development

The server uses MCP TypeScript SDK v2 and Zod 4, serving protocol revision `2026-07-28` while retaining compatibility with legacy MCP clients. Only the latest Node.js Current release is supported (minimum v26.8.1). CI follows the latest Current release. Install the locked dependencies with `npm ci`.

```bash
npm run lint
npm run typecheck
npm test
```

Tests exercise MCP initialization, tool discovery, validation, and Spotify operations using mocked HTTP responses. They do not require Spotify credentials or change your Spotify account.
