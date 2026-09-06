/* =========================================================
   CONTINUE WATCHING
========================================================= */

function _cwHtmlEscape(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function _cwSlideLeft(id) {
    if (typeof slideLeft === "function") slideLeft(id);
}

function _cwSlideRight(id) {
    if (typeof slideRight === "function") slideRight(id);
}

function _cwSlugify(text, fallback, year) {
    var base = year ? String(text || "") + "-" + String(year) : String(text || "");
    var slug = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || String(fallback || "");
}

var _CW_VIDFAST_ORIGINS = [
    "https://vidfast.pro", "https://vidfast.in", "https://vidfast.io",
    "https://vidfast.me", "https://vidfast.net", "https://vidfast.pm",
    "https://vidfast.vc", "https://vidfast.bz"
];

function _cwServerLabel(server) {
    var labels = {
        vidfast: "Vidfast",
        vidking: "Vidking",
        vidnest: "Vidnest",
        vidsrc: "Vidsrc",
        videasy: "Videasy"
    };
    return labels[String(server || "").toLowerCase()] || "Vidfast";
}

function _cwProgressPercent(item) {
    var saved = Number(item && item.progress_percent);
    if (Number.isFinite(saved)) return Math.max(0, Math.min(100, saved));
    var position = Number(item && item.position), duration = Number(item && item.duration);
    return Number.isFinite(position) && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : null;
}

function _cwFormatTime(value) {
    var seconds = Math.max(0, Math.floor(Number(value) || 0));
    var minutes = Math.floor(seconds / 60);
    var remaining = seconds % 60;
    if (minutes >= 60) return Math.floor(minutes / 60) + "h " + String(minutes % 60).padStart(2, "0") + "m";
    return minutes + ":" + String(remaining).padStart(2, "0");
}

function _cwResumeQuery(item) {
    var params = new URLSearchParams();
    params.set("server", item && item.server ? item.server : "vidfast");
    params.set("resume", "1");
    var position = Number(item && item.position);
    if (Number.isFinite(position) && position > 0) params.set("resume_position", String(Math.floor(position)));
    return params.toString();
}

function _cwCardInfo(item, isTv) {
    var percent = _cwProgressPercent(item);
    var duration = Number(item && item.duration);
    var position = Number(item && item.position);
    var server = _cwServerLabel(item && item.server);
    var title = _cwHtmlEscape(item && item.title ? item.title : "Continue Watching");
    var detail = isTv ? "S" + Number(item.season || 0) + " E" + Number(item.episode || 0) : server;
    if (percent !== null) {
        var remaining = duration > 0 ? Math.max(0, duration - position) : 0;
        detail += " · " + Math.round(percent) + "% watched" + (remaining > 0 ? " · " + _cwFormatTime(remaining) + " left" : "");
    } else {
        detail += " · Ready to resume";
    }
    var width = percent === null ? 0 : percent;
    return '<div class="cw-card-info" style="padding:10px 4px 0;color:#d1d5db;">' +
        '<div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-top:4px;">' + _cwHtmlEscape(detail) + '</div>' +
        '<div style="height:4px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;"><span style="display:block;width:' + width.toFixed(2) + '%;height:100%;background:#ff3c3c;border-radius:inherit;"></span></div>' +
        '</div>';
}

async function _cwPersist(item, force) {

    const user = await getCurrentUser();

    if (!user) {
        return false;
    }

    var position = Number(item.position);
    var duration = Number(item.duration);
    var safePosition = Number.isFinite(position) && position > 0 ? Math.round(position * 1000) / 1000 : 0;
    var safeDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) / 1000 : null;
    var percent = safeDuration ? Math.min(100, Math.max(0, (safePosition / safeDuration) * 100)) : null;

    if (!force && safePosition > 0 && item.lastSavedPosition !== undefined && Math.abs(safePosition - item.lastSavedPosition) < 10) return true;

    const { error } = await supabaseClient
        .from("continue_watching")
        .upsert(
            {
                user_id: user.id,
                media_id: Number(item.id),
                media_type: item.type,
                poster: item.poster || "",
                title: item.title || "",
                year: item.year || "",
                server: item.server || "vidfast",
                position: safePosition,
                duration: safeDuration,
                progress_percent: percent === null ? null : Math.round(percent * 100) / 100,
                season: item.type === "tv" && item.season !== null && item.season !== undefined ? Number(item.season) : null,
                episode: (item.type === "tv" || item.type === "anime") && item.episode !== null && item.episode !== undefined ? Number(item.episode) : null,
                updated_at: new Date().toISOString()
            },
            {
                onConflict: "user_id,media_id,media_type"
            }
        );

    if (error) {
        console.error("Error saving Continue Watching progress:", error);
        return false;
    } else {
        item.lastSavedPosition = safePosition;
        item.lastSaveAt = Date.now();
        return true;
    }
}

async function saveContinue(id, type, poster, server, position, duration, title, year) {
    return _cwPersist({
        id: id,
        type: type,
        poster: poster,
        title: title,
        year: year,
        server: server || "vidfast",
        position: position || 0,
        duration: duration || 0
    }, true);
}


/* =========================================================
   SAVE TV
========================================================= */

async function saveContinueTV(id, poster, season, episode, server, position, duration, title, year) {
    return _cwPersist({
        id: id,
        type: "tv",
        poster: poster,
        title: title,
        year: year,
        season: season,
        episode: episode,
        server: server || "vidfast",
        position: position || 0,
        duration: duration || 0
    }, true);
}


/* =========================================================
   SAVE ANIME EPISODE
========================================================= */

async function saveContinueAnime(id, episode, variant, poster) {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    const { error } = await supabaseClient
        .from("continue_watching")
        .upsert(
            {
                user_id: user.id,
                media_id: Number(id),
                media_type: "anime",
                poster: poster || "",
                season: null,
                episode: Number(episode),
                updated_at: new Date().toISOString()
            },
            {
                onConflict: "user_id,media_id,media_type"
            }
        );

    if (error) {
        console.error("Error saving anime episode:", error);
    }
}


/* =========================================================
   WATCH PAGE PLAYBACK STATE
========================================================= */

function initUzzPlayback(config) {
    var player = document.getElementById("player");
    if (!player || !config || !config.id) return;

    var query = new URLSearchParams(window.location.search);
    var validServers = ["vidfast", "vidking", "vidnest", "vidsrc", "videasy"];
    var requestedServer = query.get("server");
    var state = {
        server: validServers.indexOf(requestedServer) !== -1 ? requestedServer : "vidfast",
        position: Number(query.get("resume_position")) > 0 ? Number(query.get("resume_position")) : 0,
        duration: 0,
        lastSavedPosition: 0,
        lastSaveAt: 0,
        playing: false
    };

    function isVidfastMessage(event) {
        return _CW_VIDFAST_ORIGINS.indexOf(event.origin) !== -1 && event.data && event.data.type === "PLAYER_EVENT" && event.data.data;
    }

    function markServer(server) {
        state.server = validServers.indexOf(server) !== -1 ? server : "vidfast";
        document.querySelectorAll(".server-btn[data-server]").forEach(function (button) {
            var active = button.dataset.server === state.server;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function sendResumeCommand() {
        if (state.server !== "vidfast" || !state.position || !player.contentWindow) return;
        player.contentWindow.postMessage({ command: "seek", time: Math.floor(state.position) }, "*");
        player.contentWindow.postMessage({ command: "setCurrentTime", currentTime: Math.floor(state.position) }, "*");
    }

    function setPlayer(server) {
        markServer(server);
        var nextUrl = config.urls && config.urls[state.server];
        if (nextUrl) player.src = nextUrl;
    }

    async function persist(force) {
        var position = Number(state.position);
        var duration = Number(state.duration);
        var percent = duration > 0 ? (position / duration) * 100 : null;
        if (percent !== null && percent >= 97) {
            var user = await getCurrentUser();
            if (user) {
                await supabaseClient.from("continue_watching").delete()
                    .eq("user_id", user.id)
                    .eq("media_id", Number(config.id))
                    .eq("media_type", config.type);
            }
            return;
        }
        if (!force && Date.now() - state.lastSaveAt < 15000 && Math.abs(position - state.lastSavedPosition) < 10) return;
        await _cwPersist({
            id: config.id,
            type: config.type,
            poster: config.poster,
            title: config.title,
            year: config.year,
            season: config.season,
            episode: config.episode,
            server: state.server,
            position: position,
            duration: duration,
            lastSavedPosition: state.lastSavedPosition
        }, true);
        state.lastSavedPosition = position;
        state.lastSaveAt = Date.now();
    }

    async function restore() {
        var user = await getCurrentUser();
        if (!user) return;
        var result = await supabaseClient.from("continue_watching")
            .select("server,position,duration,season,episode")
            .eq("user_id", user.id)
            .eq("media_id", Number(config.id))
            .eq("media_type", config.type)
            .maybeSingle();
        var record = result.data;
        if (result.error || !record) return;

        var sameEpisode = config.type !== "tv" || (Number(record.season) === Number(config.season) && Number(record.episode) === Number(config.episode));
        if (validServers.indexOf(record.server) !== -1) state.server = record.server;
        if (sameEpisode && Number(record.position) > 0) state.position = Number(record.position);
        if (sameEpisode && Number(record.duration) > 0) state.duration = Number(record.duration);
        state.lastSavedPosition = state.position;
    }

    window.changeServer = function (url, button) {
        persist(true);
        setPlayer(button && button.dataset ? button.dataset.server : "vidfast");
    };

    window.addEventListener("message", function (event) {
        if (!isVidfastMessage(event) || state.server !== "vidfast") return;
        var data = event.data.data;
        var currentTime = Number(data.currentTime);
        var duration = Number(data.duration);
        if (Number.isFinite(currentTime) && currentTime >= 0) state.position = currentTime;
        if (Number.isFinite(duration) && duration > 0) state.duration = duration;
        if (typeof data.playing === "boolean") state.playing = data.playing;
        else if (data.event === "play" || data.event === "timeupdate") state.playing = true;
        else if (data.event === "pause" || data.event === "ended") state.playing = false;
        if (data.event === "ended") persist(true);
        else if (data.event === "pause" || data.event === "seeked") persist(true);
    });

    player.addEventListener("load", function () {
        if (state.server === "vidfast") {
            sendResumeCommand();
            var attempts = 0;
            var timer = window.setInterval(function () {
                if (state.server !== "vidfast" || !player.contentWindow || attempts++ > 20) {
                    window.clearInterval(timer);
                    return;
                }
                player.contentWindow.postMessage({ command: "getStatus" }, "*");
                sendResumeCommand();
            }, 1500);
        }
    });

    window.setInterval(function () {
        if (state.server === "vidfast" && player.contentWindow) player.contentWindow.postMessage({ command: "getStatus" }, "*");
        if (state.playing || state.position > 0) persist(false);
    }, 15000);

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") persist(true);
    });
    window.addEventListener("pagehide", function () { persist(true); });

    document.querySelectorAll(".server-btn[data-server]").forEach(function (button) {
        button.addEventListener("click", function () {
            persist(true);
            setPlayer(button.dataset.server);
        });
    });

    (async function () {
        await restore();
        if (query.get("resume_position") && Number(query.get("resume_position")) > 0) state.position = Number(query.get("resume_position"));
        setPlayer(state.server);
        await persist(true);
    }());
}


/* =========================================================
   GET ALL CONTINUE WATCHING
========================================================= */

async function getAllContinue() {

    const user = await getCurrentUser();

    if (!user) {
        return [];
    }

    const { data, error } = await supabaseClient
        .from("continue_watching")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", {
            ascending: false
        })
        .limit(20);

    if (error) {
        console.error("Error loading Continue Watching:", error);
        return [];
    }

    var rows = data || [];
    return Promise.all(rows.map(async function (item) {
        if ((item.title && item.year) || (item.media_type !== "movie" && item.media_type !== "tv")) return item;
        try {
            var response = await fetch("/media-info/" + item.media_type + "/" + Number(item.media_id) + "/", { credentials: "same-origin" });
            if (response.ok) {
                var info = await response.json();
                item.title = info.title || "";
                item.year = info.year || "";
            }
        } catch (error) {
            // Keep the numeric fallback link if metadata cannot be loaded.
        }
        return item;
    }));
}


/* =========================================================
   RENDER TV CONTINUE WATCHING
========================================================= */

async function renderContinueTV(containerId) {

    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    const list = await getAllContinue();

    /* Only TV */
    const tvList = list.filter(item => item.media_type === "tv");

    if (tvList.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `

        <div class="content-section">

            <div class="slider-header">

                <h2 class="section-title">
                    Continue Watching
                </h2>

                <div class="slider-controls">

                    <button onclick="_cwSlideLeft('${containerId}-slider')">
                        ❮
                    </button>

                    <button onclick="_cwSlideRight('${containerId}-slider')">
                        ❯
                    </button>

                </div>

            </div>


            <div class="movie-row" id="${containerId}-slider">

                ${tvList.map(item => `

                    <div class="movie-card"
                         style="position:relative;">

                        <!-- DELETE -->

                        <button
                            onclick="removeContinueTV(${Number(item.media_id)})"
                            style="
                                position:absolute;
                                top:8px;
                                right:8px;
                                background:rgba(0,0,0,0.7);
                                border:none;
                                color:white;
                                width:28px;
                                height:28px;
                                border-radius:50%;
                                cursor:pointer;
                                z-index:10;
                                font-size:14px;
                            "
                        >
                            ✕
                        </button>


                        <!-- EPISODE -->

                        <div style="
                            position:absolute;
                            bottom:8px;
                            left:8px;
                            background:rgba(0,0,0,0.8);
                            padding:4px 8px;
                            border-radius:6px;
                            font-size:12px;
                            z-index:10;
                            color:white;
                        ">
                            S${item.season} E${item.episode}
                        </div>


                        <a href="/tv/${encodeURIComponent(_cwSlugify(item.title, item.media_id, item.year))}/watch/?season=${item.season}&episode=${item.episode}&${_cwResumeQuery(item)}">

                            <img
                                loading="lazy"
                                decoding="async"
                                src="https://image.tmdb.org/t/p/w342${_cwHtmlEscape(item.poster || '')}"
                            >

                        </a>

                        ${_cwCardInfo(item, true)}

                    </div>

                `).join("")}

            </div>

        </div>

    `;
}


/* =========================================================
   REMOVE TV
========================================================= */

async function removeContinueTV(id) {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    const { error } = await supabaseClient
        .from("continue_watching")
        .delete()
        .eq("user_id", user.id)
        .eq("media_id", Number(id))
        .eq("media_type", "tv");

    if (error) {
        console.error("Error removing TV:", error);
        return;
    }

    renderContinueTV("continue-tv");
}


/* =========================================================
   REMOVE MOVIE
========================================================= */

async function removeContinueMovie(id) {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    const { error } = await supabaseClient
        .from("continue_watching")
        .delete()
        .eq("user_id", user.id)
        .eq("media_id", Number(id))
        .eq("media_type", "movie");

    if (error) {
        console.error("Error removing movie:", error);
        return;
    }

    renderContinueMovies("continue-movie");
}


/* =========================================================
   RENDER MOVIE CONTINUE WATCHING
========================================================= */

async function renderContinueMovies(containerId) {

    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    const list = await getAllContinue();

    /* Only movies */
    const movieList = list.filter(item => item.media_type === "movie");

    if (movieList.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `

        <div class="content-section">

            <div class="slider-header">

                <h2 class="section-title">
                    Continue Watching
                </h2>

                <div class="slider-controls">

                    <button onclick="_cwSlideLeft('${containerId}-slider')">
                        ❮
                    </button>

                    <button onclick="_cwSlideRight('${containerId}-slider')">
                        ❯
                    </button>

                </div>

            </div>


            <div class="movie-row" id="${containerId}-slider">

                ${movieList.map(item => `

                    <div class="movie-card"
                         style="position:relative;">

                        <!-- DELETE -->

                        <button
                            onclick="removeContinueMovie(${Number(item.media_id)})"
                            style="
                                position:absolute;
                                top:8px;
                                right:8px;
                                background:rgba(0,0,0,0.7);
                                border:none;
                                color:white;
                                width:28px;
                                height:28px;
                                border-radius:50%;
                                cursor:pointer;
                                z-index:10;
                                font-size:14px;
                            "
                        >
                            ✕
                        </button>


                        <!-- WATCH LINK -->

                        <a href="/movie/${encodeURIComponent(_cwSlugify(item.title, item.media_id, item.year))}/watch/?${_cwResumeQuery(item)}">

                            <img
                                loading="lazy"
                                decoding="async"
                                src="https://image.tmdb.org/t/p/w342${_cwHtmlEscape(item.poster || '')}"
                            >

                        </a>

                        ${_cwCardInfo(item, false)}

                    </div>

                `).join("")}

            </div>

        </div>

    `;
}


/* =========================================================
   RENDER HOME CONTINUE WATCHING
========================================================= */

async function renderContinueHome(containerId) {

    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    const list = (await getAllContinue()).filter(item => item.media_type === "movie" || item.media_type === "tv");

    if (list.length === 0) {
        container.innerHTML = "";
        return;
    }


    container.innerHTML = `

        <div class="content-section">

            <div class="slider-header">

                <h2 class="section-title">
                    Continue Watching
                </h2>

                <div class="slider-controls">

                    <button onclick="_cwSlideLeft('${containerId}-slider')">
                        ❮
                    </button>

                    <button onclick="_cwSlideRight('${containerId}-slider')">
                        ❯
                    </button>

                </div>

            </div>


            <div class="movie-row" id="${containerId}-slider">

                ${list.map(item => `

                    <div class="movie-card"
                         style="position:relative;">

                        <!-- DELETE -->

                        <button
                            onclick="removeMixed(${Number(item.media_id)}, '${_cwHtmlEscape(item.media_type || '')}')"
                            style="
                                position:absolute;
                                top:8px;
                                right:8px;
                                background:rgba(0,0,0,0.7);
                                border:none;
                                color:white;
                                width:28px;
                                height:28px;
                                border-radius:50%;
                                cursor:pointer;
                                z-index:10;
                            "
                        >
                            ✕
                        </button>


                        <!-- TV EPISODE BADGE -->

                        ${
                            item.media_type === "tv"
                            ? `
                                <div style="
                                    position:absolute;
                                    bottom:8px;
                                    left:8px;
                                    background:rgba(0,0,0,0.8);
                                    padding:4px 8px;
                                    border-radius:6px;
                                    font-size:12px;
                                    z-index:10;
                                    color:white;
                                ">
                                    S${item.season} E${item.episode}
                                </div>
                            `
                            : ""
                        }


                        <!-- WATCH LINK -->

                        <a href="${
                            item.media_type === "movie"
                            ? `/movie/${encodeURIComponent(_cwSlugify(item.title, item.media_id, item.year))}/watch/?${_cwResumeQuery(item)}`
                            : `/tv/${encodeURIComponent(_cwSlugify(item.title, item.media_id, item.year))}/watch/?season=${item.season}&episode=${item.episode}&${_cwResumeQuery(item)}`
                        }">

                            <img
                                loading="lazy"
                                decoding="async"
                                src="https://image.tmdb.org/t/p/w342${_cwHtmlEscape(item.poster || '')}"
                            >

                        </a>

                        ${_cwCardInfo(item, item.media_type === "tv")}

                    </div>

                `).join("")}

            </div>

        </div>

    `;
}


/* =========================================================
   REMOVE MOVIE / TV FROM HOME
========================================================= */

async function removeMixed(id, type) {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    const { error } = await supabaseClient
        .from("continue_watching")
        .delete()
        .eq("user_id", user.id)
        .eq("media_id", Number(id))
        .eq("media_type", type);

    if (error) {
        console.error("Error removing item:", error);
        return;
    }

    renderContinueHome("continue-home");
}


/* =========================================================
   AUTO LOAD CONTINUE WATCHING
========================================================= */

window.addEventListener("DOMContentLoaded", () => {

    renderContinueHome("continue-home");

});
