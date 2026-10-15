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

The HTTP server is multi-user. Each person signs in with Spotify and grants their
MCP client access to their own account. Better Auth provides the OAuth 2.1 MCP
provider, JWT signing, discovery, PKCE, consent, and token refresh. Spotify tokens
stay on the server; MCP clients receive separate, audience-bound MCP tokens.

### Configuration

Copy `.env.example` to `.env` and set:

```dotenv
MCP_TRANSPORT=http
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3000
BETTER_AUTH_URL=https://spotify-mcp.phidel.dev
BETTER_AUTH_SECRET=GENERATE_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_APP_CLIENT_ID
SPOTIFY_CLIENT_SECRET=YOUR_SPOTIFY_APP_CLIENT_SECRET
DATABASE_PATH=./data/spotify.sqlite
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -hex 32`. Preserve it across
restarts and deployments: it encrypts stored Spotify credentials and protects
sessions. Use the externally reachable HTTPS origin for `BETTER_AUTH_URL`, with
no path or trailing components. Forward that domain to container port 3000.
The public origin is read from configuration rather than forwarded headers.

In the Spotify Developer Dashboard, register this exact redirect URI:

```text
https://spotify-mcp.phidel.dev/api/auth/callback/spotify
```

For local development set `BETTER_AUTH_URL=http://127.0.0.1:3000` and register
`http://127.0.0.1:3000/api/auth/callback/spotify` instead. Access the site through
that same origin. The Spotify app's own access restrictions still apply to
people who sign in; removing the server's old account allowlist does not change
Spotify's app permissions or approval requirements.

### Connect ChatGPT or another MCP client

1. Add `https://spotify-mcp.phidel.dev/mcp` as the server URL.
2. Select OAuth and Client ID Metadata Document (CIMD) registration. Discovery
   advertises CIMD and PKCE S256; no manually entered OAuth client secret is needed.
3. Request `openid offline_access spotify:tools` if the client asks for scopes.
4. Sign in with Spotify, then approve the client's consent screen.

CIMD clients must serve valid public HTTPS metadata documents. The configured
fetch transport rejects private network addresses and redirects. Dynamic Client
Registration is disabled. Other clients can be created by a signed-in user with
Better Auth's `/api/auth/oauth2/create-client` API; the returned client credentials
belong to this authorization server, not to the Spotify app.

Discovery is public at `/.well-known/oauth-protected-resource` (also `/mcp`
suffixed) and `/.well-known/oauth-authorization-server/api/auth`. The issuer is
`BETTER_AUTH_URL/api/auth`, and the protected resource is `BETTER_AUTH_URL/mcp`.
HTTP requires MCP protocol revision `2026-07-28`; older session-based HTTP clients
are rejected. The existing tool surface is unchanged.

### SQLite storage and account isolation

Users, browser sessions, Spotify accounts, signing keys, OAuth clients, consent,
authorization state, refresh grants, and rate limits persist in SQLite using
Node's built-in SQLite driver. Startup applies Better Auth's additive schema
migrations before accepting requests. Spotify access and refresh tokens are
encrypted using `BETTER_AUTH_SECRET`; the database file is created with mode 0600.
The database uses WAL mode, foreign keys, and a five-second busy timeout.

Every MCP request validates token signature, issuer, resource audience, expiry,
and the `spotify:tools` scope. Only the verified subject selects the user's
Spotify account. User IDs supplied in tool arguments cannot select another
account. SDK clients are created per operation and token refreshes are serialized
per user within the process. No shared Spotify credentials are used as fallback.

MCP access tokens expire after 15 minutes. OAuth refresh grants rotate through
Better Auth. Revoking a refresh grant stops subsequent refreshes; an already
issued JWT may remain usable until its expiry. Signing out ends the browser
session; it is not a revoke-all-clients action. A missing/deleted Spotify account
fails that user's tool calls without affecting other accounts.

Run one replica against a persistent local disk volume at `/app/data`; do not
share this SQLite file between containers or hosts. Back up SQLite with an
online backup tool, or stop the server and back up the entire data directory
(including any WAL), together with the stable auth secret. Copying only a live
`.sqlite` file can lose committed writes in its WAL.

### Migrate from the shared-token server

The old `MCP_API_TOKEN`, `MCP_AUTH`, `SPOTIFY_USER_ID`, `SPOTIFY_REDIRECT_URI`,
`SPOTIFY_TOKEN_FILE`, and `SPOTIFY_AUTHORIZATION_SERVERS` settings are no longer
used. Update the runtime environment and Spotify callback URI before deploying.
The old `spotify-tokens.json` is left untouched and is never imported or served:
it has no tenant ownership information. Each user must sign in again. Existing
static-token MCP connections must be recreated using OAuth.

### Run locally or in Docker

```bash
npm ci
npm run build
node --env-file=.env build/index.js
```

Or run `docker compose up --build -d`. The Compose file binds port 3000 to the
host's loopback interface and mounts the `spotify-data` volume at `/app/data`.
Use an HTTPS reverse proxy for public access. `/health` remains unauthenticated
for container health checks. Environment files are loaded by Node's `--env-file`
flag or Docker Compose, not implicitly by the application.

For Dokploy, keep the existing domain and data volume, replace the old runtime
settings with the new variables above, and point the domain to container port
3000. The existing CI/CD pipeline builds the image and triggers Dokploy after
checks pass. This code migration does not update a running deployment's secrets
or Spotify dashboard configuration.

### Local stdio clients

Stdio remains available when `MCP_TRANSPORT` is unset. For Spotify operations,
configure the same database, Better Auth settings and Spotify app credentials,
then set `SPOTIFY_LOCAL_USER_ID` to an existing Better Auth user ID after signing
in through the HTTP site. This selector is only for a trusted local process; it
is never read from HTTP requests. An unset or unknown user ID fails instead of
choosing the first account in the database. Avoid running simultaneous HTTP and
stdio processes against the same account because refresh serialization is local
to each process; use HTTP OAuth clients for concurrent access.

## Development

The server uses MCP TypeScript SDK v2 and Zod 4, serving protocol revision `2026-07-28` with legacy protocol compatibility retained only for stdio. Only the latest Node.js Current release is supported (minimum v26.8.1). CI follows the latest Current release. Install the locked dependencies with `npm ci`.

```bash
npm run lint
npm run typecheck
npm test
```

Tests exercise MCP initialization, tool discovery, validation, and Spotify operations using mocked HTTP responses. They do not require Spotify credentials or change your Spotify account.
