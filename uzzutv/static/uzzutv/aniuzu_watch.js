/* =========================================================
   ANIUZU WATCH PAGE — Player Logic & Episode Management
   ========================================================= */

var AZWProviders = {
    anilink: {
        name: "AniLink",
        origin: "https://anilink.cc",
        buildUrl: function(anilistId, episode, variant, resumeTime) {
            var url = "https://anilink.cc/watch/" + anilistId + "/" + episode + "?variant=" + variant + "&autonext=true";
            if (resumeTime && resumeTime > 0) url += "&start=" + Math.floor(resumeTime);
            return url;
        }
    },
    tryembed: {
        name: "TryEmbed",
        origin: "https://tryembed.us.cc",
        buildUrl: function(anilistId, episode, variant, resumeTime) {
            var url = "https://tryembed.us.cc/embed/anime/" + anilistId + "/" + episode + "/" + variant;
            if (resumeTime && resumeTime > 0) url += "?startAt=" + Math.floor(resumeTime);
            return url;
        }
    }
};

/* =========================================================
   STATE
   ========================================================= */

var AZW = null;

/* =========================================================
   INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", function() {
    azwInitState();
    if (!AZW) return;

    azwRenderEpisodes();
    azwLoadPlayer(AZW.source);
    azwUpdateNavButtons();

    var player = document.getElementById("azw-player");
    if (player) {
        player.addEventListener("load", function() {
            azwHideLoading();
        });
    }

    azwSetupSearch();
    azwScrollToActive();
    azwSetupMessageListener();
    azwSetupVariantButtons();
    azwSetupSourceButtons();
    azwSetupIframeDetection();
});

function azwInitState() {
    var root = document.getElementById("azw-root");
    if (!root) return;

    var raw = root.getAttribute("data-episodes");
    var episodes = [];
    try {
        episodes = JSON.parse(raw || "[]");
    } catch (e) {
        episodes = [];
    }

    AZW = {
        anilistId: parseInt(root.getAttribute("data-anilist"), 10),
        currentEpisode: parseInt(root.getAttribute("data-episode"), 10),
        totalEpisodes: parseInt(root.getAttribute("data-total"), 10),
        variant: root.getAttribute("data-variant") || "sub",
        source: root.getAttribute("data-source") || "anilink",
        title: root.getAttribute("data-title") || "",
        coverImage: root.getAttribute("data-cover") || "",
        episodes: episodes
    };
}

/* =========================================================
   EPISODE PANEL RENDERING
   ========================================================= */

function azwRenderEpisodes() {
    var list = document.getElementById("azw-ep-list");
    if (!list || !AZW || !AZW.episodes) return;

    if (AZW.episodes.length === 0) {
        list.innerHTML = '<div class="azw-ep-empty">No episodes available</div>';
        return;
    }

    var html = "";
    for (var i = 0; i < AZW.episodes.length; i++) {
        var ep = AZW.episodes[i];
        var active = ep.number === AZW.currentEpisode ? " active" : "";
        var titleAttr = ep.title ? ' title="' + azwAttrEscape(ep.title) + '"' : "";
        var titleHtml = ep.title
            ? '<span class="azw-ep-name">' + azwHtmlEscape(ep.title) + '</span>'
            : "";
        html += '<a class="azw-ep-item' + active + '"'
            + ' data-ep="' + ep.number + '"'
            + ' data-title="' + azwAttrEscape((ep.title || "").toLowerCase()) + '"'
            + titleAttr
            + ' href="#">'
            + '<span class="azw-ep-num">' + ep.number + '</span>'
            + titleHtml
            + '</a>';
    }

    list.innerHTML = html;

    var items = list.querySelectorAll(".azw-ep-item");
    for (var j = 0; j < items.length; j++) {
        items[j].addEventListener("click", azwOnEpisodeClick);
    }
}

function azwHtmlEscape(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function azwAttrEscape(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/* =========================================================
   CLIENT-SIDE EPISODE SWITCHING
   ========================================================= */

function azwOnEpisodeClick(e) {
    e.preventDefault();
    var el = e.currentTarget;
    var epNum = parseInt(el.getAttribute("data-ep"), 10);
    if (isNaN(epNum) || epNum === AZW.currentEpisode) return;

    azwSwitchEpisode(epNum);
}

function azwSwitchEpisode(epNum) {
    if (!AZW) return;

    var target = Math.max(1, Math.min(epNum, AZW.totalEpisodes));
    AZW.currentEpisode = target;

    var items = document.querySelectorAll(".azw-ep-item");
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var num = parseInt(item.getAttribute("data-ep"), 10);
        if (num === target) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    }

    var badge = document.getElementById("azw-ep-badge");
    if (badge) badge.textContent = "Episode " + target;

    var label = document.getElementById("azw-ep-label");
    if (label) label.textContent = "Episode " + target;

    document.title = AZW.title
        ? AZW.title + " - Episode " + target + " | Aniuzu"
        : "Aniuzu - Episode " + target;

    azwUpdateNavButtons();
    azwUpdateUrl();
    azwScrollToActive();
    azwLoadPlayer(AZW.source);
    azwTrackEpisodeSwitch(target);
}

/* =========================================================
   NAVIGATION BUTTONS
   ========================================================= */

function azwUpdateNavButtons() {
    var prev = document.getElementById("azw-prev");
    var next = document.getElementById("azw-next");
    if (!prev || !next || !AZW) return;

    var prevEp = azwFindAdjacentEpisode(-1);
    var nextEp = azwFindAdjacentEpisode(1);

    if (prevEp) {
        prev.href = azwBuildWatchUrl(prevEp);
        prev.classList.remove("disabled");
    } else {
        prev.href = "#";
        prev.classList.add("disabled");
    }

    if (nextEp) {
        next.href = azwBuildWatchUrl(nextEp);
        next.classList.remove("disabled");
    } else {
        next.href = "#";
        next.classList.add("disabled");
    }
}

function azwFindAdjacentEpisode(direction) {
    if (!AZW || !AZW.episodes) return null;

    var currentIdx = -1;
    for (var i = 0; i < AZW.episodes.length; i++) {
        if (AZW.episodes[i].number === AZW.currentEpisode) {
            currentIdx = i;
            break;
        }
    }

    if (currentIdx === -1) return null;
    var targetIdx = currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= AZW.episodes.length) return null;
    return AZW.episodes[targetIdx].number;
}

function azwBuildWatchUrl(epNum) {
    return "/aniuzu/anime/" + AZW.anilistId + "/watch/" + epNum
        + "/?variant=" + AZW.variant + "&source=" + AZW.source;
}

function azwUpdateUrl() {
    if (!AZW) return;
    var newUrl = azwBuildWatchUrl(AZW.currentEpisode);
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", newUrl);
    }
}

/* =========================================================
   EPISODE SWITCH TRACKING
   ========================================================= */

function azwTrackEpisodeSwitch(epNum) {
    try {
        if (typeof saveAniuzuContinue === "function") {
            saveAniuzuContinue(AZW.anilistId, epNum, AZW.variant, AZW.coverImage, AZW.title);
        }
    } catch (e) {}
}

/* =========================================================
   PLAYER LOADING
   ========================================================= */

function azwLoadPlayer(source, resumeTime) {
    var player = document.getElementById("azw-player");
    if (!player || !AZW) return;

    var provider = AZWProviders[source];
    if (!provider) return;

    azwShowLoading("Loading Episode " + AZW.currentEpisode + "...");

    var url = provider.buildUrl(
        AZW.anilistId,
        AZW.currentEpisode,
        AZW.variant,
        resumeTime || 0
    );

    player.src = url;
    player.title = provider.name + " Episode Playback";
}

function azwShowLoading(msg) {
    var el = document.getElementById("azw-loading");
    if (!el) return;
    el.classList.remove("hidden");
    var span = el.querySelector("span");
    if (span && msg) span.textContent = msg;
}

function azwHideLoading() {
    var el = document.getElementById("azw-loading");
    if (!el) return;
    el.classList.add("hidden");
}

/* =========================================================
   VARIANT (SUB/DUB)
   ========================================================= */

function azwSetupVariantButtons() {
    var buttons = document.querySelectorAll(".azw-variant-btn");
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", function() {
            azwSetVariant(this.getAttribute("data-variant"), this);
        });
    }
}

function azwSetVariant(variant, btn) {
    if (!AZW || AZW.variant === variant) return;

    AZW.variant = variant;

    var buttons = document.querySelectorAll(".azw-variant-btn");
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove("active");
    }
    btn.classList.add("active");

    azwUpdateNavButtons();
    azwLoadPlayer(AZW.source);
}

/* =========================================================
   SOURCE (AniLink / TryEmbed)
   ========================================================= */

function azwSetupSourceButtons() {
    var buttons = document.querySelectorAll(".azw-source-btn");
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", function() {
            azwSetSource(this.getAttribute("data-source"), this);
        });
    }
}

function azwSetSource(source, btn) {
    if (!AZW || AZW.source === source) return;

    AZW.source = source;

    var buttons = document.querySelectorAll(".azw-source-btn");
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove("active");
    }
    btn.classList.add("active");

    azwUpdateNavButtons();

    var providerName = AZWProviders[source] ? AZWProviders[source].name : source;
    azwShowLoading("Switching to " + providerName + "...");
    azwLoadPlayer(source);
}

/* =========================================================
   EPISODE SEARCH
   ========================================================= */

function azwSetupSearch() {
    var input = document.getElementById("azw-search");
    if (!input) return;

    input.addEventListener("input", function() {
        var query = input.value.toLowerCase().trim();
        var items = document.querySelectorAll(".azw-ep-item");

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var num = item.getAttribute("data-ep") || "";
            var title = item.getAttribute("data-title") || "";
            var match = !query || num === query || title.indexOf(query) !== -1;
            item.style.display = match ? "" : "none";
        }
    });
}

/* =========================================================
   SCROLL TO ACTIVE EPISODE
   ========================================================= */

function azwScrollToActive() {
    var active = document.querySelector(".azw-ep-item.active");
    if (!active) return;

    var list = document.getElementById("azw-ep-list");
    if (!list) return;

    var listRect = list.getBoundingClientRect();
    var activeRect = active.getBoundingClientRect();

    if (activeRect.top < listRect.top || activeRect.bottom > listRect.bottom) {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
}

/* =========================================================
   postMessage HANDLER — AniLink & TryEmbed
   ========================================================= */

var _azwAllowedOrigins = {
    "https://anilink.cc": "anilink",
    "https://tryembed.us.cc": "tryembed"
};

function azwSetupMessageListener() {
    window.addEventListener("message", function(event) {
        var origin = event.origin;
        var provider = _azwAllowedOrigins[origin];
        if (!provider) return;

        var data = event.data;
        if (!data || typeof data !== "object") return;

        if (provider === "anilink") {
            azwHandleAniLinkMessage(data);
        } else if (provider === "tryembed") {
            azwHandleTryEmbedMessage(data);
        }
    });
}

function azwHandleAniLinkMessage(data) {
    var type = data.type || "";
    if (type.indexOf("anilink-player:") !== 0) return;

    var evtName = type.substring("anilink-player:".length);
    var payload = data.payload || {};

    switch (evtName) {
        case "ready":
            azwHideLoading();
            break;
        case "progress":
            if (typeof payload.position === "number" && typeof payload.duration === "number") {
                azwSaveProgress(payload.position, payload.duration);
            }
            break;
        case "episodechange":
            if (typeof payload.episodeNumber === "number") {
                azwNavigateToEpisode(payload.episodeNumber);
            }
            break;
        case "autonext":
            azwOnEpisodeEnded();
            break;
        case "ended":
            azwOnEpisodeEnded();
            break;
        case "error":
            azwShowError("AniLink playback unavailable.", "anilink");
            break;
    }
}

function azwHandleTryEmbedMessage(data) {
    if (data.type !== "PLAYER_EVENT" || !data.data) return;

    var evt = data.data;

    if (typeof evt.currentTime === "number" && typeof evt.duration === "number" && evt.duration > 0) {
        azwSaveProgress(evt.currentTime, evt.duration);
    }

    if (evt.event === "ended") {
        azwOnEpisodeEnded();
    }

    if (evt.event === "error") {
        azwShowError("TryEmbed playback unavailable.", "tryembed");
    }
}

/* =========================================================
   PROGRESS
   ========================================================= */

var _azwProgressTimer = null;

function azwSaveProgress(position, duration) {
    if (_azwProgressTimer) return;

    _azwProgressTimer = setTimeout(function() {
        _azwProgressTimer = null;
    }, 15000);

    if (!AZW) return;

    try {
        if (typeof saveAniuzuContinue === "function") {
            saveAniuzuContinue(AZW.anilistId, AZW.currentEpisode, AZW.variant, AZW.coverImage, AZW.title);
        }
    } catch (e) {}
}

/* =========================================================
   EPISODE ENDED / EPISODE CHANGE
   ========================================================= */

function azwOnEpisodeEnded() {
    var nextEp = azwFindAdjacentEpisode(1);
    if (nextEp) azwNavigateToEpisode(nextEp);
}

function azwNavigateToEpisode(epNum) {
    if (!AZW) return;
    var target = Math.max(1, Math.min(epNum, AZW.totalEpisodes));
    if (target === AZW.currentEpisode) return;

    var url = "/aniuzu/anime/" + AZW.anilistId + "/watch/" + target
        + "/?variant=" + AZW.variant + "&source=" + AZW.source;
    window.location.href = url;
}

/* =========================================================
   ERROR STATE
   ========================================================= */

function azwShowError(msg, failedSource) {
    azwHideLoading();

    var wrap = document.getElementById("azw-player-wrap");
    if (!wrap) return;

    var existing = wrap.querySelector(".azw-error-overlay");
    if (existing) existing.remove();

    var fallbackSource = (failedSource === "anilink") ? "tryembed" : "anilink";
    var fallbackName = AZWProviders[fallbackSource] ? AZWProviders[fallbackSource].name : fallbackSource;

    var overlay = document.createElement("div");
    overlay.className = "azw-error-overlay";
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;"
        + "display:flex;flex-direction:column;align-items:center;justify-content:center;"
        + "background:#000;z-index:10;color:#9ca3af;font-size:14px;gap:14px;border-radius:14px;";

    var span = document.createElement("span");
    span.style.cssText = "color:#d1d5db;font-weight:600;";
    span.textContent = msg;

    var btn = document.createElement("button");
    btn.className = "azw-fallback-btn";
    btn.textContent = "Try " + fallbackName;

    overlay.appendChild(span);
    overlay.appendChild(btn);
    wrap.appendChild(overlay);

    btn.addEventListener("click", function() {
        var targetBtn = document.querySelector('[data-source="' + fallbackSource + '"]');
        if (targetBtn) azwSetSource(fallbackSource, targetBtn);
        overlay.remove();
    });
}

/* =========================================================
   IFRAME NAVIGATION DETECTION
   Detect when the iframe navigates to a new episode
   (for TryEmbed which doesn't send episodechange events)
   ========================================================= */

var _azwLastIframeSrc = "";
var _azwIframeLoadBusy = false;

function azwSetupIframeDetection() {
    var player = document.getElementById("azw-player");
    if (!player) return;

    _azwLastIframeSrc = player.src || "";

    player.addEventListener("load", function() {
        if (_azwIframeLoadBusy) return;

        var currentSrc = player.src || "";

        if (currentSrc && currentSrc !== _azwLastIframeSrc) {
            _azwLastIframeSrc = currentSrc;

            var epMatch = currentSrc.match(/\/(\d+)(?:\/|\?|$)/);
            if (epMatch) {
                var newEp = parseInt(epMatch[1], 10);
                if (!isNaN(newEp) && newEp !== AZW.currentEpisode && newEp > 0) {
                    _azwIframeLoadBusy = true;
                    setTimeout(function() { _azwIframeLoadBusy = false; }, 3000);
                    azwNavigateToEpisode(newEp);
                }
            }
        }
    });

    if (typeof MutationObserver !== "undefined") {
        var observer = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mut = mutations[i];
                if (mut.attributeName === "src") {
                    var newSrc = player.src || "";
                    if (newSrc && newSrc !== _azwLastIframeSrc) {
                        _azwLastIframeSrc = newSrc;
                    }
                }
            }
        });
        observer.observe(player, { attributes: true, attributeFilter: ["src"] });
    }
}
