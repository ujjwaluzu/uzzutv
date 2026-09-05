/* Aniuzu playback is intentionally limited to the documented AniLink and
   TryEmbed iframe contracts. The iframe never supplies application state. */
(function () {
    "use strict";

    var configNode = document.getElementById("aniuzu-watch-config");
    if (!configNode) return;

    var config;
    try { config = JSON.parse(configNode.textContent); } catch (e) { return; }

    var ANILINK_ORIGIN = "https://anilink.cc";
    var TRYEMBED_ORIGIN = "https://tryembed.us.cc";
    var SAVE_INTERVAL_MS = 20000;
    var POSITION_DELTA_SECONDS = 12;
    var MINIMUM_SAVE_SECONDS = 10;
    var COMPLETION_PERCENT = 97;
    var COMPLETION_NEAR_END_PERCENT = 90;
    var COMPLETION_REMAINING_SECONDS = 120;
    var EPISODE_WINDOW = 26;
    var MAXIMUM_RESUME_SECONDS = 43200;

    var validEpisodes = (config.episodes || []).map(Number).filter(function (n) { return Number.isInteger(n) && n > 0; });
    var query = new URLSearchParams(window.location.search);
    var server = query.get("server") === "tryembed" ? "tryembed" : "anilink";
    var variant = query.get("variant") === "dub" ? "dub" : "sub";
    var state = {
        anilistId: Number(config.anilistId),
        episodeNumber: Number(config.episodeNumber),
        server: server,
        variant: variant,
        position: 0,
        duration: 0,
        resumePosition: 0
    };
    var player = document.getElementById("az-player");
    var loading = document.getElementById("az-player-loading");
    var errorBox = document.getElementById("az-player-error");
    var errorTitle = document.getElementById("az-player-error-title");
    var list = document.getElementById("az-episode-list");
    var range = document.getElementById("az-episode-range");
    var count = document.getElementById("az-episode-count");
    var search = document.getElementById("az-episode-search");
    var pager = document.getElementById("az-episode-pager");
    var label = document.getElementById("az-watch-episode-label");
    var lastSavedPosition = 0;
    var lastSaveAt = 0;
    var playerTimer = null;
    var preWatchUrl = (function () {
        var fallback = "/aniuzu/anime/" + state.anilistId + "/";
        var referrer = document.referrer || "";
        return referrer && referrer.indexOf(window.location.host) !== -1 ? referrer : fallback;
    }());
    var episodeOffset = 0;
    var activeUser = null;

    function finiteNumber(value) {
        var number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function safeResumePosition(value) {
        var position = finiteNumber(value);
        return position !== null && position > 0 && position <= MAXIMUM_RESUME_SECONDS ? Math.floor(position) : 0;
    }

    function validPosition(position, duration) {
        return position !== null && position >= 0 && (duration === null || duration <= 0 || position <= duration + 5);
    }

    function buildAnilinkUrl(playbackState) {
        var url = new URL(ANILINK_ORIGIN + "/watch/" + playbackState.anilistId + "/" + playbackState.episodeNumber);
        url.searchParams.set("variant", playbackState.variant);
        if (playbackState.resumePosition > 0) url.searchParams.set("start", String(Math.floor(playbackState.resumePosition)));
        return url.toString();
    }

    function buildTryEmbedUrl(playbackState) {
        var url = new URL(TRYEMBED_ORIGIN + "/embed/anime/" + playbackState.anilistId + "/" + playbackState.episodeNumber + "/" + playbackState.variant);
        url.searchParams.set("autoplay", "true");
        url.searchParams.set("autoSkip", "true");
        url.searchParams.set("autoNext", "false");
        if (playbackState.resumePosition > 0) url.searchParams.set("startAt", String(Math.floor(playbackState.resumePosition)));
        return url.toString();
    }

    function buildPlayerUrl() {
        return state.server === "tryembed" ? buildTryEmbedUrl(state) : buildAnilinkUrl(state);
    }

    function otherServer() { return state.server === "anilink" ? "tryembed" : "anilink"; }

    function updateControls() {
        document.querySelectorAll("[data-server]").forEach(function (button) {
            var selected = button.dataset.server === state.server;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        document.querySelectorAll("[data-variant]").forEach(function (button) {
            var selected = button.dataset.variant === state.variant;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        if (label) label.textContent = "Episode " + state.episodeNumber;
        if (player) player.title = (config.title || "Anime") + " Episode " + state.episodeNumber;
    }

    function updateAddress(replace) {
        var url = "/aniuzu/anime/" + state.anilistId + "/watch/" + state.episodeNumber + "/?server=" + encodeURIComponent(state.server) + "&variant=" + encodeURIComponent(state.variant);
        // Keep the watch-page marker and the preserved pre-watch page on every
        // entry this script writes, so a refresh can recognise the watch entry
        // and Back can always leave the watch experience in one step.
        var entry = { aniuzuWatchEntry: true, preWatchUrl: preWatchUrl };
        window.history[replace ? "replaceState" : "pushState"](entry, "", url);
    }

    function showError() {
        loading.hidden = true;
        errorTitle.textContent = (state.server === "anilink" ? "AniLink" : "TryEmbed") + " couldn’t load this episode.";
        errorBox.hidden = false;
    }

    function loadPlayer() {
        window.clearTimeout(playerTimer);
        errorBox.hidden = true;
        loading.hidden = false;
        player.src = buildPlayerUrl();
        playerTimer = window.setTimeout(showError, 18000);
    }

    function filteredEpisodes() {
        var term = (search.value || "").trim();
        if (!term) return validEpisodes;
        return validEpisodes.filter(function (episode) { return String(episode).indexOf(term) !== -1; });
    }

    function ensureActiveWindow() {
        var source = filteredEpisodes();
        var currentIndex = source.indexOf(state.episodeNumber);
        if (currentIndex >= 0 && (episodeOffset > currentIndex || episodeOffset + EPISODE_WINDOW <= currentIndex)) {
            episodeOffset = Math.floor(currentIndex / EPISODE_WINDOW) * EPISODE_WINDOW;
        }
    }

    function renderEpisodes(resetWindow) {
        if (resetWindow) {
            episodeOffset = 0;
            ensureActiveWindow();
        }
        var source = filteredEpisodes();
        count.textContent = validEpisodes.length + " total";
        list.textContent = "";
        pager.textContent = "";
        if (!source.length) {
            range.textContent = "";
            var empty = document.createElement("p");
            empty.className = "az-episode-empty";
            empty.textContent = "No matching episodes.";
            list.appendChild(empty);
            return;
        }
        episodeOffset = Math.min(episodeOffset, Math.max(0, source.length - 1));
        var visible = source.slice(episodeOffset, episodeOffset + EPISODE_WINDOW);
        range.textContent = source.length > EPISODE_WINDOW ? "Showing " + (episodeOffset + 1) + "–" + (episodeOffset + visible.length) + " of " + source.length : source.length + " episode" + (source.length === 1 ? "" : "s");
        var fragment = document.createDocumentFragment();
        visible.forEach(function (episode) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "az-episode-button" + (episode === state.episodeNumber ? " is-active" : "");
            button.textContent = "Episode " + episode;
            button.setAttribute("role", "listitem");
            button.dataset.episode = String(episode);
            fragment.appendChild(button);
        });
        list.appendChild(fragment);
        var activeButton = list.querySelector(".az-episode-button.is-active");
        if (activeButton) {
            // Keep the active episode in view without moving the page itself.
            var targetScrollTop = activeButton.offsetTop;
            if (targetScrollTop < list.scrollTop) {
                list.scrollTop = targetScrollTop;
            } else {
                var bottomEdge = targetScrollTop + activeButton.offsetHeight;
                var visibleBottom = list.scrollTop + list.clientHeight;
                if (bottomEdge > visibleBottom) {
                    list.scrollTop = Math.max(0, bottomEdge - list.clientHeight);
                }
            }
        }
        if (source.length > EPISODE_WINDOW) {
            var previous = document.createElement("button");
            previous.type = "button";
            previous.textContent = "Previous";
            previous.disabled = episodeOffset === 0;
            previous.addEventListener("click", function () { episodeOffset = Math.max(0, episodeOffset - EPISODE_WINDOW); renderEpisodes(false); });
            var next = document.createElement("button");
            next.type = "button";
            next.textContent = "Next";
            next.disabled = episodeOffset + EPISODE_WINDOW >= source.length;
            next.addEventListener("click", function () { episodeOffset += EPISODE_WINDOW; renderEpisodes(false); });
            pager.appendChild(previous);
            pager.appendChild(next);
        }
    }

    async function currentUser() {
        if (activeUser !== null) return activeUser;
        activeUser = typeof getCurrentUser === "function" ? await getCurrentUser() : null;
        return activeUser;
    }

    function progressPercent() {
        return state.duration > 0 ? Math.min(100, Math.max(0, (state.position / state.duration) * 100)) : null;
    }

    function isComplete() {
        var percent = progressPercent();
        if (percent === null) return false;
        var remaining = state.duration - state.position;
        return percent >= COMPLETION_PERCENT || (percent >= COMPLETION_NEAR_END_PERCENT && remaining <= COMPLETION_REMAINING_SECONDS);
    }

    async function saveProgress(force) {
        // Snapshot playback state before awaiting auth. Episode/server changes
        // can happen while the session promise resolves; the write must belong
        // to the episode that was actually playing when it was requested.
        var snapshot = {
            anilistId: state.anilistId,
            episodeNumber: state.episodeNumber,
            server: state.server,
            variant: state.variant,
            position: state.position,
            duration: state.duration
        };
        var user = await currentUser();
        if (!user || snapshot.position < MINIMUM_SAVE_SECONDS) return;
        var now = Date.now();
        if (!force && now - lastSaveAt < SAVE_INTERVAL_MS && Math.abs(snapshot.position - lastSavedPosition) < POSITION_DELTA_SECONDS) return;
        var snapshotPercent = snapshot.duration > 0 ? Math.min(100, Math.max(0, (snapshot.position / snapshot.duration) * 100)) : null;
        var snapshotComplete = snapshotPercent !== null && (snapshotPercent >= COMPLETION_PERCENT || (snapshotPercent >= COMPLETION_NEAR_END_PERCENT && snapshot.duration - snapshot.position <= COMPLETION_REMAINING_SECONDS));
        if (snapshotComplete) {
            await supabaseClient.from("aniuzu_continue_watching").delete().eq("user_id", user.id).eq("anilist_id", snapshot.anilistId);
            lastSaveAt = now;
            return;
        }
        var payload = {
            user_id: user.id,
            anilist_id: snapshot.anilistId,
            episode_number: snapshot.episodeNumber,
            variant: snapshot.variant,
            server: snapshot.server,
            position: Math.round(snapshot.position * 1000) / 1000,
            duration: snapshot.duration > 0 ? Math.round(snapshot.duration * 1000) / 1000 : null,
            progress_percent: snapshotPercent === null ? null : Math.round(snapshotPercent * 100) / 100,
            updated_at: new Date().toISOString()
        };
        var result = await supabaseClient.from("aniuzu_continue_watching").upsert(payload, { onConflict: "user_id,anilist_id" });
        if (!result.error) {
            lastSavedPosition = snapshot.position;
            lastSaveAt = now;
        } else {
            console.error("Aniuzu Continue Watching save failed:", result.error);
        }
    }

    function updateProgress(position, duration, force) {
        if (!validPosition(position, duration)) return;
        state.position = position;
        if (duration !== null && duration > 0) state.duration = duration;
        state.resumePosition = 0;
        saveProgress(Boolean(force));
    }

    function validPlayerOrigin(event, expectedOrigin) {
        // Providers may relay player events through a nested same-origin frame.
        // The documented, immutable origin is the security boundary here; the
        // event format is still validated before any playback value is used.
        return event.origin === expectedOrigin;
    }

    function episodeFromPayload(payload) {
        if (!payload || typeof payload !== "object") return null;
        // Providers use slightly different names for the episode-change value.
        // Accept only numeric values that are present in AniList's playable list.
        var candidates = [payload.episodeNumber, payload.episode_number, payload.episode,
            payload.toEpisode, payload.nextEpisode, payload.number];
        for (var i = 0; i < candidates.length; i += 1) {
            var value = finiteNumber(candidates[i]);
            if (value !== null && Number.isInteger(value) && validEpisodes.indexOf(value) !== -1) return value;
        }
        return null;
    }

    function handleAniLinkMessage(event) {
        if (!validPlayerOrigin(event, ANILINK_ORIGIN) || !event.data || typeof event.data !== "object") return;
        var type = event.data.type || event.data.event;
        if (typeof type !== "string" || !/^anilink-player:(ready|play|pause|ended|episodechange|variantchange|progress|error)$/.test(type)) return;
        var payload = event.data.data && typeof event.data.data === "object" ? event.data.data :
            (event.data.payload && typeof event.data.payload === "object" ? event.data.payload : event.data);
        if (type === "anilink-player:error") { showError(); return; }
        if (type === "anilink-player:episodechange") {
            var changedEpisode = episodeFromPayload(payload);
            if (changedEpisode !== null && changedEpisode !== state.episodeNumber) changeEpisode(changedEpisode);
        }
        if (type === "anilink-player:ended") { state.position = state.duration || state.position; saveProgress(true); return; }
        var position = finiteNumber(payload.position !== undefined ? payload.position : payload.currentTime);
        var duration = finiteNumber(payload.duration);
        if (type === "anilink-player:progress" && validPosition(position, duration)) updateProgress(position, duration, false);
        if (type === "anilink-player:pause" || type === "anilink-player:episodechange" || type === "anilink-player:variantchange") { if (validPosition(position, duration)) updateProgress(position, duration, true); else saveProgress(true); }
    }

    function handleTryEmbedMessage(event) {
        if (!validPlayerOrigin(event, TRYEMBED_ORIGIN) || !event.data || typeof event.data !== "object") return;
        // Some TryEmbed builds expose the next button as a dedicated message.
        if (event.data.type === "PLAYER_NEXT_EPISODE") {
            var nextPayload = event.data.detail && typeof event.data.detail === "object" ? event.data.detail : event.data.data;
            var nextEpisode = episodeFromPayload(nextPayload);
            if (nextEpisode !== null && nextEpisode !== state.episodeNumber) changeEpisode(nextEpisode);
            return;
        }
        if (event.data.type !== "PLAYER_EVENT") return;
        var payload = event.data.data;
        if (!payload || typeof payload !== "object") return;
        var eventName = String(payload.event || "").toLowerCase();
        if (!/^(timeupdate|pause|ended|seeked|play|loadedmetadata|episodechange|episode_change|episodechanged|next|next_episode)$/.test(eventName)) return;
        if (eventName === "episodechange" || eventName === "episode_change" || eventName === "episodechanged" || eventName === "next" || eventName === "next_episode") {
            var changedEpisode = episodeFromPayload(payload);
            if (changedEpisode !== null && changedEpisode !== state.episodeNumber) changeEpisode(changedEpisode);
            return;
        }
        var position = finiteNumber(payload.currentTime);
        var duration = finiteNumber(payload.duration);
        if (!validPosition(position, duration)) return;
        if (payload.event === "ended") { state.position = duration || position; state.duration = duration || state.duration; saveProgress(true); return; }
        updateProgress(position, duration, payload.event === "pause" || payload.event === "seeked");
    }

    window.addEventListener("message", function (event) {
        if (state.server === "anilink") handleAniLinkMessage(event);
        else handleTryEmbedMessage(event);
    });

    async function restoreExplicitResume() {
        if (query.get("resume") !== "1") return;
        // The home card carries the already-authenticated saved position so the
        // iframe does not have to wait for a second auth/session round-trip.
        // This is only a playback hint; Supabase remains authoritative below.
        var handoffPosition = safeResumePosition(query.get("resume_position"));
        if (handoffPosition) {
            state.position = handoffPosition;
            state.resumePosition = handoffPosition;
        }
        var user = await currentUser();
        if (!user) return;
        var result = await supabaseClient.from("aniuzu_continue_watching").select("server,variant,position,duration,episode_number").eq("user_id", user.id).eq("anilist_id", state.anilistId).maybeSingle();
        var record = result.data;
        if (!record || result.error) {
            if (result.error) console.warn("Aniuzu resume lookup failed; using the Continue Watching handoff position.", result.error);
            return;
        }
        state.server = record.server === "tryembed" ? "tryembed" : "anilink";
        state.variant = record.variant === "dub" ? "dub" : "sub";
        state.position = safeResumePosition(record.position);
        state.duration = Math.max(0, finiteNumber(record.duration) || 0);
        state.resumePosition = state.position;
    }

    function changeEpisode(episode) {
        if (validEpisodes.indexOf(episode) === -1 || episode === state.episodeNumber) return;
        saveProgress(true);
        state.episodeNumber = episode;
        state.position = 0;
        state.duration = 0;
        state.resumePosition = 0;
        lastSavedPosition = 0;
        updateAddress(true);
        updateControls();
        ensureActiveWindow();
        renderEpisodes(false);
        loadPlayer();
    }

    document.querySelectorAll("[data-server]").forEach(function (button) {
        button.addEventListener("click", function () {
            var nextServer = button.dataset.server;
            if (nextServer === state.server) return;
            saveProgress(true);
            state.server = nextServer === "tryembed" ? "tryembed" : "anilink";
            updateAddress(true); updateControls(); loadPlayer();
        });
    });
    document.querySelectorAll("[data-variant]").forEach(function (button) {
        button.addEventListener("click", function () {
            var nextVariant = button.dataset.variant;
            if (nextVariant === state.variant) return;
            saveProgress(true);
            state.variant = nextVariant === "dub" ? "dub" : "sub";
            updateAddress(true); updateControls(); loadPlayer();
        });
    });
    list.addEventListener("click", function (event) {
        var button = event.target.closest("[data-episode]");
        if (button) changeEpisode(Number(button.dataset.episode));
    });
    search.addEventListener("input", function () { renderEpisodes(true); });
    player.addEventListener("load", function () { window.clearTimeout(playerTimer); loading.hidden = true; });
    document.getElementById("az-retry-player").addEventListener("click", loadPlayer);
    document.getElementById("az-switch-server").addEventListener("click", function () { document.querySelector('[data-server="' + otherServer() + '"]').click(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveProgress(true); });
    window.addEventListener("pagehide", function () { saveProgress(true); });
    window.addEventListener("popstate", function () {
        // Back actions that stay inside the watch document can only be the
        // companion entry pushed for direct visits. Leave the watch experience
        // to the saved pre-watch page (or the detail fallback) and replace the
        // current entry so a second Back never re-enters the watch page.
        var url = (window.history.state && window.history.state.preWatchUrl) || preWatchUrl;
        if (url) window.location.replace(url);
        else window.location.reload();
    });

    var sidebarEl = document.querySelector(".az-episode-sidebar");
    var playerColumnEl = document.querySelector(".az-player-column");
    function sizeSidebar() {
        if (!sidebarEl || !playerColumnEl) return;
        if (window.matchMedia("(max-width:900px)").matches) return;
        sidebarEl.style.height = playerColumnEl.offsetHeight + "px";
        sidebarEl.style.maxHeight = playerColumnEl.offsetHeight + "px";
    }
    if (sidebarEl && playerColumnEl) {
        sizeSidebar();
        window.addEventListener("resize", sizeSidebar);
        var sidebarObserver = new MutationObserver(sizeSidebar);
        if (window.ResizeObserver) {
            new ResizeObserver(sizeSidebar).observe(playerColumnEl);
        }
    }

    (async function initialise() {
        await restoreExplicitResume();

        // Direct visits (new tab, bookmark, typed URL) have nothing underneath
        // the watch page in history. Push a companion entry so Back can return
        // to a sensible Aniuzu page instead of dead-ending. When the user
        // arrived from another page, that page is already the previous history
        // entry and pushing would only add an unwanted intermediate stop.
        if (window.history.length === 1) {
            window.history.pushState({ aniuzuWatchEntry: true, preWatchUrl: preWatchUrl }, "", window.location.href);
        }

        var backLink = document.querySelector(".az-watch-back");
        if (backLink) backLink.href = preWatchUrl;

        updateAddress(true);
        updateControls();
        renderEpisodes(true);
        loadPlayer();
    }());
}());
