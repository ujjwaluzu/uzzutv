/* =========================================================
   ANIUZU WATCH PAGE — reimplemented (clean)
   Player + episode sidebar + language/server controls
   ========================================================= */

var AZW_PROVIDERS = {
    anilink: {
        name: "AniLink",
        buildUrl: function(anilistId, episode, variant, resumeTime) {
            var url = "https://anilink.cc/watch/" + anilistId + "/" + episode + "?variant=" + variant + "&autonext=true";
            if (resumeTime > 0) url += "&start=" + Math.floor(resumeTime);
            return url;
        }
    },
    tryembed: {
        name: "TryEmbed",
        buildUrl: function(anilistId, episode, variant, resumeTime) {
            var url = "https://tryembed.us.cc/embed/anime/" + anilistId + "/" + episode + "/" + variant;
            if (resumeTime > 0) url += "?startAt=" + Math.floor(resumeTime);
            return url;
        }
    }
};

var AZW_ALLOWED_ORIGINS = {
    "https://anilink.cc": "anilink",
    "https://tryembed.us.cc": "tryembed"
};

/* === State === */

var state = null;
var progressTimer = null;
var lastSwitchTime = 0;

/* === Boot === */

document.addEventListener("DOMContentLoaded", function() {
    var root = document.getElementById("azw-root");
    if (!root) return;

    state = {
        anilistId: parseInt(root.getAttribute("data-anilist"), 10),
        episode: parseInt(root.getAttribute("data-episode"), 10),
        total: parseInt(root.getAttribute("data-total"), 10),
        variant: root.getAttribute("data-variant") || "sub",
        source: root.getAttribute("data-source") || "anilink",
        title: root.getAttribute("data-title") || "",
        cover: root.getAttribute("data-cover") || "",
        episodes: parseEpisodes(root)
    };

    if (isNaN(state.anilistId) || isNaN(state.episode)) return;
    if (isNaN(state.total) || state.total < 1) state.total = state.episodes.length || 1;

    bindPlayerLoad();
    renderEpisodeList();
    updateNav();
    buildPicker();
    bindSearch();

    azwFetchResumeTime().then(function(t) {
        azwLoad(t);
    });
});

function parseEpisodes(root) {
    try {
        var raw = JSON.parse(root.getAttribute("data-episodes") || "[]");
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

/* === Player loading === */

function azwLoad(resumeTime) {
    var provider = AZW_PROVIDERS[state.source];
    if (!provider) {
        azwShowError("Unknown server: " + state.source);
        return;
    }

    showLoading("Loading Episode " + state.episode + "...");

    var player = document.getElementById("azw-player");
    var url = provider.buildUrl(state.anilistId, state.episode, state.variant, resumeTime || 0);
    player.src = url;
    player.title = state.title ? (state.title + " - Episode " + state.episode) : ("Episode " + state.episode);
}

function bindPlayerLoad() {
    var player = document.getElementById("azw-player");
    if (!player) return;
    player.addEventListener("load", function() {
        hideLoading();
        lastSwitchTime = Date.now();
    });
}

/* === Loading / error overlay === */

function showLoading(msg) {
    var el = document.getElementById("azw-loading");
    if (!el) return;
    var span = document.getElementById("azw-loading-msg");
    if (span && msg) span.textContent = msg;
    el.classList.remove("hidden");
}

function hideLoading() {
    var el = document.getElementById("azw-loading");
    if (el) el.classList.add("hidden");
}

function azwShowError(msg) {
    hideLoading();
    var wrap = document.getElementById("azw-player-wrap");
    if (!wrap) return;

    var existing = wrap.querySelector(".azw-error-overlay");
    if (existing) existing.remove();

    var fallback = (state.source === "anilink") ? "tryembed" : "anilink";
    var fallbackName = AZW_PROVIDERS[fallback].name;

    var overlay = document.createElement("div");
    overlay.className = "azw-error-overlay";

    var span = document.createElement("span");
    span.className = "azw-error-span";
    span.textContent = msg;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "azw-fallback-btn";
    btn.textContent = "Try " + fallbackName;

    overlay.appendChild(span);
    overlay.appendChild(btn);
    wrap.appendChild(overlay);

    btn.addEventListener("click", function() {
        setSource(fallback);
        overlay.remove();
    });
}

/* === Episode list === */

function renderEpisodeList() {
    var list = document.getElementById("azw-ep-list");
    if (!list) return;

    if (!state.episodes.length) {
        list.innerHTML = '<div class="azw-ep-empty">No episodes available</div>';
        return;
    }

    var html = "";
    for (var i = 0; i < state.episodes.length; i++) {
        var ep = state.episodes[i];
        var active = (ep.number === state.episode) ? " active" : "";
        html += '<a href="#" class="azw-ep-item' + active + '" data-ep="' + ep.number
            + '" data-title="episode ' + ep.number + '">'
            + '<span class="azw-ep-num">' + ep.number + '</span>'
            + '<span class="azw-ep-name">Episode ' + ep.number + '</span>'
            + '</a>';
    }

    list.innerHTML = html;

    var items = list.querySelectorAll(".azw-ep-item");
    for (var j = 0; j < items.length; j++) {
        items[j].addEventListener("click", function(e) {
            e.preventDefault();
            var n = parseInt(this.getAttribute("data-ep"), 10);
            if (!isNaN(n)) azwSwitchEpisode(n);
        });
    }

    scrollToActive();
}

function scrollToActive() {
    var active = document.querySelector(".azw-ep-item.active");
    var list = document.getElementById("azw-ep-list");
    if (!active || !list) return;
    var lr = list.getBoundingClientRect();
    var ar = active.getBoundingClientRect();
    if (ar.top < lr.top || ar.bottom > lr.bottom) {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
}

/* === Episode switching === */

function azwSwitchEpisode(n) {
    var target = clamp(n, 1, state.total);
    if (target === state.episode) return;

    state.episode = target;
    lastSwitchTime = Date.now();

    var items = document.querySelectorAll(".azw-ep-item");
    for (var i = 0; i < items.length; i++) {
        if (parseInt(items[i].getAttribute("data-ep"), 10) === target) {
            items[i].classList.add("active");
        } else {
            items[i].classList.remove("active");
        }
    }

    setBadge("Episode " + target);
    updateNav();
    updateUrl();
    scrollToActive();

    if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }

    azwLoad(0);
    trackSwitch();
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(v, hi));
}

function setBadge(text) {
    var badge = document.getElementById("azw-ep-badge");
    var label = document.getElementById("azw-ep-label");
    if (badge) badge.textContent = text;
    if (label) label.textContent = text;
    document.title = state.title
        ? state.title + " - " + text + " | Aniuzu"
        : "Aniuzu - " + text;
}

function azwBuildUrl(ep) {
    return "/aniuzu/anime/" + state.anilistId + "/watch/" + ep
        + "/?variant=" + encodeURIComponent(state.variant) + "&source=" + encodeURIComponent(state.source);
}

function updateUrl() {
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", azwBuildUrl(state.episode));
    }
}

/* === Nav buttons === */

function updateNav() {
    var prev = document.getElementById("azw-prev");
    var next = document.getElementById("azw-next");
    if (!prev || !next) return;

    var idx = indexOfEpisode();
    var p = (idx > 0) ? state.episodes[idx - 1].number : null;
    var nx = (idx !== -1 && idx < state.episodes.length - 1) ? state.episodes[idx + 1].number : null;

    if (p) {
        prev.href = azwBuildUrl(p);
        prev.classList.remove("disabled");
    } else {
        prev.href = "#";
        prev.classList.add("disabled");
    }

    if (nx) {
        next.href = azwBuildUrl(nx);
        next.classList.remove("disabled");
    } else {
        next.href = "#";
        next.classList.add("disabled");
    }
}

function indexOfEpisode() {
    for (var i = 0; i < state.episodes.length; i++) {
        if (state.episodes[i].number === state.episode) return i;
    }
    return -1;
}

/* === Language / Server picker === */

function buildPicker() {
    bindPicker("#azw-variant-btns", ".azw-variant-btn", function(btn) {
        var v = btn.getAttribute("data-variant");
        if (!state || state.variant === v) return;
        state.variant = v;
        document.querySelectorAll(".azw-variant-btn").forEach(function(b) {
            b.classList.toggle("active", b.getAttribute("data-variant") === v);
        });
        updateNav();
        azwLoad(0);
    });
    bindPicker("#azw-source-btns", ".azw-source-btn", function(btn) {
        var s = btn.getAttribute("data-source");
        if (!state || state.source === s) return;
        setSource(s);
    });
}

function bindPicker(containerSel, btnSel, handler) {
    var container = document.querySelector(containerSel);
    if (!container) return;
    var btns = container.querySelectorAll(btnSel);
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener("click", function() {
            handler(this);
        });
    }
}

function setSource(s) {
    if (!state || state.source === s) return;
    state.source = s;
    var btns = document.querySelectorAll(".azw-source-btn");
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-source") === s);
    }
    updateNav();
    var name = AZW_PROVIDERS[s] ? AZW_PROVIDERS[s].name : s;
    showLoading("Switching to " + name + "...");
    azwLoad(0);
}

/* === Search === */

function bindSearch() {
    var input = document.getElementById("azw-search");
    if (!input) return;
    input.addEventListener("input", function() {
        var q = input.value.toLowerCase().trim().replace(/\s+/g, " ");
        var items = document.querySelectorAll(".azw-ep-item");
        for (var i = 0; i < items.length; i++) {
            var num = items[i].getAttribute("data-ep") || "";
            var title = items[i].getAttribute("data-title") || "";
            var compact = title.replace(/\s+/g, "");
            var match = !q
                || num === q
                || q.replace(/\s+/g, "") === compact
                || title.indexOf(q) !== -1;
            items[i].style.display = match ? "" : "none";
        }
    });
}

/* === postMessage from providers === */

window.addEventListener("message", function(event) {
    var provider = AZW_ALLOWED_ORIGINS[event.origin];
    if (!provider) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (provider === "anilink") {
        handleAniLink(data);
    } else if (provider === "tryembed") {
        handleTryEmbed(data);
    }
});

function handleAniLink(data) {
    var type = data.type || "";
    if (type.indexOf("anilink-player:") !== 0) return;
    var evt = type.substring("anilink-player:".length);
    var payload = data.payload || {};

    switch (evt) {
        case "ready":
            hideLoading();
            break;
        case "progress":
            if (typeof payload.position === "number" && typeof payload.duration === "number") {
                azwSaveProgress(payload.position, payload.duration);
            }
            break;
        case "episodechange":
            if (typeof payload.episodeNumber === "number"
                && payload.episodeNumber > 0
                && Date.now() - lastSwitchTime > 5000
                && payload.episodeNumber !== state.episode) {
                azwSwitchEpisode(payload.episodeNumber);
            }
            break;
        case "autonext":
        case "ended":
            azwOnEnded();
            break;
        case "error":
            azwShowError("AniLink playback unavailable.");
            break;
    }
}

function handleTryEmbed(data) {
    if (data.type !== "PLAYER_EVENT" || !data.data) return;
    var evt = data.data;

    if (typeof evt.currentTime === "number" && typeof evt.duration === "number" && evt.duration > 0) {
        azwSaveProgress(evt.currentTime, evt.duration);
    }
    if (evt.event === "ended") azwOnEnded();
    if (evt.event === "error") azwShowError("TryEmbed playback unavailable.");
}

function azwOnEnded() {
    var idx = indexOfEpisode();
    if (idx !== -1 && idx < state.episodes.length - 1) {
        azwSwitchEpisode(state.episodes[idx + 1].number);
    }
}

/* === Resume time === */

async function azwFetchResumeTime() {
    try {
        if (typeof getCurrentUser !== "function" || typeof supabaseClient === "undefined") return 0;
        var user = await getCurrentUser();
        if (!user) return 0;
        var res = await supabaseClient
            .from("aniuzu_continue_watching")
            .select("position")
            .eq("user_id", user.id)
            .eq("media_id", Number(state.anilistId))
            .eq("episode", Number(state.episode))
            .maybeSingle();
        if (res.error || !res.data) return 0;
        return Number(res.data.position) || 0;
    } catch (e) {
        return 0;
    }
}

/* === Progress / tracking === */

function azwSaveProgress(position, duration) {
    if (progressTimer) return;
    progressTimer = setTimeout(function() { progressTimer = null; }, 15000);
    try {
        if (typeof saveAniuzuContinue === "function") {
            saveAniuzuContinue(state.anilistId, state.episode, state.variant, state.cover, state.title, position, duration, state.source);
        }
    } catch (e) {}
}

function trackSwitch() {
    try {
        if (typeof saveAniuzuContinue === "function") {
            saveAniuzuContinue(state.anilistId, state.episode, state.variant, state.cover, state.title, 0, 0, state.source);
        }
    } catch (e) {}
}
