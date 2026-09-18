\
const API = "https://api.spotify.com/v1";
const AUTH = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";

// Playlist IDs confirmed from Tanner's Spotify account.
// "Okay" is intentionally left null; the app will auto-match it by name if created later.
const SOURCE = {
  name: "Discover Weekly Archive",
  id: "2xMOVGVfT7jRMlMzw5VdhS",
};

const RANKS = [
  { name: "Excellent", emoji: "🌟", id: "55Zj1kaOuzUhHmA2UojGys" },
  { name: "Great",     emoji: "🔥", id: "3wFobQCh8hAwPdbAQKWu7m" },
  { name: "Good",      emoji: "👍", id: "3mlprjSbvdzEbCMP9x68Nn" },
  { name: "Okay",      emoji: "🙂", id: null },
  { name: "Average",   emoji: "😐", id: "2yoNenoKO1O1TNRIeBtoqm" },
  { name: "Meh",       emoji: "😕", id: "0mEtsHeUmscgGUYMn2wrp7" },
];

const OTHERS = [
  { name: "Beats",                emoji: "🥁", id: "5Dn4wSlxiHcJCIZrpYH1mj" },
  { name: "Leaks",                emoji: "💧", id: "2IhKzWCtITJCmpd9VrOaJT" },
  { name: "Already Played",       emoji: "↻",  id: "0MbAp0XmaS3EO2qbYlDnjs" },
  { name: "Chill PlaylistRating", emoji: "❄️", id: "1KTYC84qhZ7TuG6PYgqqNb" },
];

const SCOPES = [
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
];

const state = {
  current: null,
  busy: false,
  lastAction: null,
  playlists: new Map(),
  toastTimer: null,
};

const $ = (id) => document.getElementById(id);
const setupCard = $("setupCard");
const appView = $("appView");
const redirectUri = cleanRedirectUri();

function cleanRedirectUri() {
  return window.location.origin + window.location.pathname;
}

function playlistId(entry) {
  return entry.id || state.playlists.get(entry.name)?.id || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showToast(message, timeout = 2500) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove("show"), timeout);
}

function setBusy(value) {
  state.busy = value;
  $("workingBadge").hidden = !value;
  document.querySelectorAll(".rank-btn,.other-btn,#removeBtn").forEach(btn => {
    btn.disabled = value || btn.dataset.missing === "true";
  });
}

function tokenInfo() {
  try { return JSON.parse(localStorage.getItem("spotify_tokens") || "null"); }
  catch { return null; }
}

function saveTokens(tokens) {
  const previous = tokenInfo();
  const next = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || previous?.refresh_token || null,
    expires_at: Date.now() + (Number(tokens.expires_in || 3600) * 1000) - 60_000,
  };
  localStorage.setItem("spotify_tokens", JSON.stringify(next));
}

async function sha256(plain) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

function base64url(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

async function beginLogin() {
  const clientId = $("clientIdInput").value.trim();
  if (!clientId) {
    $("setupMessage").textContent = "Paste your Spotify Client ID first.";
    return;
  }
  localStorage.setItem("spotify_client_id", clientId);

  const verifier = randomString(96);
  const challenge = base64url(await sha256(verifier));
  const authState = randomString(32);

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oauth_state", authState);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: redirectUri,
    state: authState,
  });
  window.location.assign(`${AUTH}?${params.toString()}`);
}

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (error) throw new Error(`Spotify sign-in error: ${error}`);
  if (!code) return false;

  const returnedState = params.get("state");
  const expectedState = sessionStorage.getItem("oauth_state");
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("Spotify login state did not match. Please reconnect.");
  }

  const verifier = sessionStorage.getItem("pkce_verifier");
  const clientId = localStorage.getItem("spotify_client_id");
  if (!verifier || !clientId) throw new Error("Missing PKCE login data. Please reconnect.");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Spotify token exchange failed (${response.status}).`);
  saveTokens(await response.json());

  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("oauth_state");
  history.replaceState({}, document.title, redirectUri);
  return true;
}

async function refreshAccessToken() {
  const tokens = tokenInfo();
  const clientId = localStorage.getItem("spotify_client_id");
  if (!tokens?.refresh_token || !clientId) throw new Error("Spotify connection expired. Reconnect.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: clientId,
  });

  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Could not refresh Spotify access.");
  saveTokens(await response.json());
  return tokenInfo().access_token;
}

async function getAccessToken() {
  const tokens = tokenInfo();
  if (!tokens?.access_token) throw new Error("Connect Spotify first.");
  if (Date.now() >= tokens.expires_at) return refreshAccessToken();
  return tokens.access_token;
}

async function spotify(path, options = {}, retry = true) {
  const access = await getAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${access}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API}${path}`, { ...options, headers });

  if (response.status === 401 && retry) {
    await refreshAccessToken();
    return spotify(path, options, false);
  }
  if (response.status === 204) return null;
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data?.error?.message ? `: ${data.error.message}` : "";
    } catch {}
    throw new Error(`Spotify error ${response.status}${detail}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadUserPlaylists() {
  state.playlists.clear();
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const data = await spotify(`/me/playlists?limit=50&offset=${offset}`);
    for (const p of data?.items || []) {
      // Prefer an editable match when duplicates exist.
      if (!state.playlists.has(p.name) || p.can_edit_items) {
        state.playlists.set(p.name, p);
      }
    }
    if (!data?.next || !(data.items || []).length) break;
    offset += data.items.length;
  }
  renderButtons();
  renderPlaylistStatus();
}

function renderButtons() {
  const grid = $("ratingGrid");
  grid.innerHTML = "";
  for (const rank of RANKS) {
    const id = playlistId(rank);
    const btn = document.createElement("button");
    btn.className = "rank-btn";
    btn.dataset.rank = rank.name;
    btn.dataset.missing = id ? "false" : "true";
    btn.disabled = !id || state.busy;
    btn.innerHTML = `<strong>${rank.emoji}</strong><span>${rank.name}</span>`;
    if (!id) btn.title = `${rank.name} playlist not found`;
    btn.addEventListener("click", () => classify(rank, "rank"));
    grid.appendChild(btn);
  }

  const otherGrid = $("otherGrid");
  otherGrid.innerHTML = "";
  for (const entry of OTHERS) {
    const id = playlistId(entry);
    const btn = document.createElement("button");
    btn.className = "other-btn";
    btn.dataset.missing = id ? "false" : "true";
    btn.disabled = !id || state.busy;
    btn.textContent = `${entry.emoji} ${entry.name}`;
    btn.addEventListener("click", () => classify(entry, "other"));
    otherGrid.appendChild(btn);
  }
}

function renderPlaylistStatus() {
  const wrap = $("playlistStatus");
  wrap.innerHTML = "";
  const all = [{...SOURCE, source:true}, ...RANKS, ...OTHERS];
  for (const p of all) {
    const id = p.id || state.playlists.get(p.name)?.id;
    const row = document.createElement("div");
    row.className = "playlist-status-row";
    row.innerHTML = `<span>${p.name}${p.source ? " (source)" : ""}</span>
      <span class="${id ? "ok" : "missing"}">${id ? "Connected" : "Not found"}</span>`;
    wrap.appendChild(row);
  }
}

async function getCurrentlyPlaying() {
  const response = await spotify("/me/player/currently-playing");
  state.current = response;
  renderNowPlaying();
  return response;
}

function renderNowPlaying() {
  const data = state.current;
  const item = data?.item;

  const art = $("albumArt");
  const placeholder = $("artPlaceholder");
  const link = $("spotifyTrackLink");

  if (!item) {
    $("trackName").textContent = "Nothing playing";
    $("artistName").textContent = "Start your Discover Weekly Archive in Spotify.";
    $("contextLine").textContent = "Waiting for playback";
    $("contextLine").className = "context-pill";
    art.style.display = "none";
    placeholder.style.display = "grid";
    link.removeAttribute("href");
    return;
  }

  $("trackName").textContent = item.name || "Unknown track";
  $("artistName").textContent = (item.artists || []).map(a => a.name).join(", ") || item.type || "";
  const image = item.album?.images?.[0]?.url;
  if (image) {
    art.src = image;
    art.alt = `${item.name} album art`;
    art.style.display = "block";
    placeholder.style.display = "none";
  } else {
    art.style.display = "none";
    placeholder.style.display = "grid";
  }
  if (item.external_urls?.spotify) link.href = item.external_urls.spotify;

  const ctx = data.context?.uri;
  const sourceUri = `spotify:playlist:${SOURCE.id}`;
  const contextLine = $("contextLine");
  if (ctx === sourceUri) {
    contextLine.textContent = "Playing from Discover Weekly Archive";
    contextLine.className = "context-pill good";
  } else {
    contextLine.textContent = "Not currently playing from Archive";
    contextLine.className = "context-pill warn";
  }
}

async function addToPlaylist(playlistIdValue, uri) {
  return spotify(`/playlists/${playlistIdValue}/items`, {
    method: "POST",
    body: JSON.stringify({ uris: [uri] }),
  });
}

async function removeFromPlaylist(playlistIdValue, uri) {
  return spotify(`/playlists/${playlistIdValue}/items`, {
    method: "DELETE",
    body: JSON.stringify({ items: [{ uri }] }),
  });
}

async function skipNext() {
  return spotify("/me/player/next", { method: "POST" });
}

async function classify(entry, kind) {
  if (state.busy) return;
  const destinationId = playlistId(entry);
  if (!destinationId) return showToast(`${entry.name} playlist is not connected.`);

  setBusy(true);
  try {
    const playback = await getCurrentlyPlaying();
    const item = playback?.item;
    if (!item?.uri || item.type !== "track") throw new Error("No Spotify track is currently playing.");

    const sourceUri = `spotify:playlist:${SOURCE.id}`;
    if ($("requireArchiveToggle").checked && playback.context?.uri !== sourceUri) {
      throw new Error("This song is not playing from Discover Weekly Archive.");
    }

    // Safer transaction order: add first, then clean other ranking playlists, then source.
    await addToPlaylist(destinationId, item.uri);

    if (kind === "rank") {
      for (const rank of RANKS) {
        const id = playlistId(rank);
        if (id && id !== destinationId) {
          await removeFromPlaylist(id, item.uri);
        }
      }
    }

    await removeFromPlaylist(SOURCE.id, item.uri);

    state.lastAction = {
      uri: item.uri,
      name: item.name,
      destinationId,
      destinationName: entry.name,
      sourceRemoved: true,
    };
    $("undoBtn").disabled = false;

    showToast(`${entry.emoji || "✓"} ${item.name} → ${entry.name}`);

    if ($("autoSkipToggle").checked) {
      await skipNext();
      await sleep(750);
    }
    await getCurrentlyPlaying();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Could not rate this song.", 4200);
  } finally {
    setBusy(false);
  }
}

async function removeCurrent() {
  if (state.busy) return;
  setBusy(true);
  try {
    const playback = await getCurrentlyPlaying();
    const item = playback?.item;
    if (!item?.uri || item.type !== "track") throw new Error("No Spotify track is currently playing.");

    const sourceUri = `spotify:playlist:${SOURCE.id}`;
    if ($("requireArchiveToggle").checked && playback.context?.uri !== sourceUri) {
      throw new Error("This song is not playing from Discover Weekly Archive.");
    }

    await removeFromPlaylist(SOURCE.id, item.uri);

    state.lastAction = {
      uri: item.uri,
      name: item.name,
      destinationId: null,
      destinationName: null,
      sourceRemoved: true,
    };
    $("undoBtn").disabled = false;
    showToast(`🗑 Removed ${item.name} from the Archive`);

    if ($("autoSkipToggle").checked) {
      await skipNext();
      await sleep(750);
    }
    await getCurrentlyPlaying();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Could not remove this song.", 4200);
  } finally {
    setBusy(false);
  }
}

async function undoLast() {
  if (!state.lastAction || state.busy) return;
  setBusy(true);
  try {
    const action = state.lastAction;
    if (action.destinationId) {
      await removeFromPlaylist(action.destinationId, action.uri);
    }
    if (action.sourceRemoved) {
      await addToPlaylist(SOURCE.id, action.uri);
    }
    showToast(`↶ Restored ${action.name} to Discover Weekly Archive`);
    state.lastAction = null;
    $("undoBtn").disabled = true;
  } catch (err) {
    console.error(err);
    showToast(err.message || "Undo failed.", 4200);
  } finally {
    setBusy(false);
  }
}

function showConnectedUi() {
  setupCard.hidden = true;
  appView.hidden = false;
  $("settingsClientId").value = localStorage.getItem("spotify_client_id") || "";
}

function showSetupUi() {
  setupCard.hidden = false;
  appView.hidden = true;
}

async function initializeConnected() {
  showConnectedUi();
  try {
    await loadUserPlaylists();
    await getCurrentlyPlaying();
    setInterval(() => {
      if (!state.busy && !document.hidden) getCurrentlyPlaying().catch(() => {});
    }, 7000);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Spotify setup error.", 4200);
  }
}

// ----- UI wiring -----
$("redirectUri").textContent = redirectUri;
$("clientIdInput").value = localStorage.getItem("spotify_client_id") || "";
$("connectBtn").addEventListener("click", beginLogin);
$("copyRedirectBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(redirectUri);
  $("setupMessage").textContent = "Redirect URI copied.";
});
$("refreshBtn").addEventListener("click", () => getCurrentlyPlaying().catch(err => showToast(err.message)));
$("undoBtn").addEventListener("click", undoLast);
$("removeBtn").addEventListener("click", removeCurrent);

$("autoSkipToggle").checked = localStorage.getItem("auto_skip") !== "false";
$("requireArchiveToggle").checked = localStorage.getItem("require_archive") !== "false";
$("autoSkipToggle").addEventListener("change", e => localStorage.setItem("auto_skip", String(e.target.checked)));
$("requireArchiveToggle").addEventListener("change", e => localStorage.setItem("require_archive", String(e.target.checked)));

const dialog = $("settingsDialog");
$("settingsBtn").addEventListener("click", () => {
  renderPlaylistStatus();
  dialog.showModal();
});
$("saveClientIdBtn").addEventListener("click", () => {
  const value = $("settingsClientId").value.trim();
  if (!value) return showToast("Client ID cannot be blank.");
  localStorage.setItem("spotify_client_id", value);
  $("clientIdInput").value = value;
  showToast("Client ID saved.");
});
$("disconnectBtn").addEventListener("click", () => {
  localStorage.removeItem("spotify_tokens");
  sessionStorage.clear();
  dialog.close();
  showSetupUi();
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await handleCallback();
    if (tokenInfo()?.access_token) await initializeConnected();
    else showSetupUi();
  } catch (err) {
    console.error(err);
    $("setupMessage").textContent = err.message || "Could not finish Spotify setup.";
    showSetupUi();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(console.error));
}
