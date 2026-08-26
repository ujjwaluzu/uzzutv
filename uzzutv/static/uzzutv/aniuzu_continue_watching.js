/* =========================================================
   ANIUZU CONTINUE WATCHING
   Dedicated table: aniuzu_continue_watching
   ========================================================= */

function _azCwHtmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function saveAniuzuContinue(anilistId, episode, variant, poster, title, position, duration) {

    try {
        var user = await getCurrentUser();
        if (!user) return;

        var { error } = await supabaseClient
            .from("aniuzu_continue_watching")
            .upsert(
                {
                    user_id: user.id,
                    media_id: Number(anilistId),
                    episode: Number(episode),
                    variant: variant || "sub",
                    poster: poster || "",
                    title: title || "",
                    position: typeof position === "number" ? Math.floor(position) : 0,
                    duration: typeof duration === "number" ? Math.floor(duration) : 0,
                    updated_at: new Date().toISOString()
                },
                { onConflict: "user_id,media_id" }
            );

        if (error) {
            console.error("Error saving anime continue watching:", error);
        }
    } catch (e) {
        console.error("Error saving continue watching:", e);
    }
}


async function getAllAniuzuContinue() {

    try {
        var user = await getCurrentUser();
        if (!user) return [];

        var { data, error } = await supabaseClient
            .from("aniuzu_continue_watching")
            .select("*")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(20);

        if (error) {
            console.error("Error loading anime continue watching:", error);
            return [];
        }

        return data || [];
    } catch (e) {
        console.error("Error loading continue watching:", e);
        return [];
    }
}


var _azCwRemoving = {};

async function removeAniuzuContinue(anilistId) {
    if (_azCwRemoving[anilistId]) return;
    _azCwRemoving[anilistId] = true;

    try {
        var user = await getCurrentUser();
        if (!user) return;

        var { error } = await supabaseClient
            .from("aniuzu_continue_watching")
            .delete()
            .eq("user_id", user.id)
            .eq("media_id", Number(anilistId));

        if (error) {
            console.error("Error removing anime continue watching:", error);
            return;
        }

        await renderAniuzuContinueHome("continue-anime");
    } catch (e) {
        console.error("Error removing continue watching:", e);
    } finally {
        delete _azCwRemoving[anilistId];
    }
}


async function renderAniuzuContinueHome(containerId) {

    var container = document.getElementById(containerId);
    if (!container) return;

    var skel = document.getElementById("continue-skeleton");
    var list = await getAllAniuzuContinue();

    if (list.length === 0) {
        if (skel) skel.style.display = "none";
        container.innerHTML = "";
        return;
    }

    if (skel) skel.style.display = "none";

    var cardsHtml = list.map(function(item) {
        var ep = (item.episode != null) ? Number(item.episode) : 1;
        var variant = item.variant || "sub";
        var link = "/aniuzu/anime/" + Number(item.media_id) + "/watch/" + ep + "/?variant=" + encodeURIComponent(variant);
        var titleText = item.title || "Anime";
        var pos = Number(item.position) || 0;
        var dur = Number(item.duration) || 0;
        var pct = dur > 0 ? Math.min(Math.round((pos / dur) * 100), 100) : 0;
        var progressBar = dur > 0 ? '<div style="position:absolute;bottom:0;left:0;width:100%;height:3px;background:rgba(255,255,255,.15);z-index:10;"><div style="height:100%;width:' + pct + '%;background:#ff3c3c;border-radius:0 2px 2px 0;"></div></div>' : '';
        return '<div class="az-card" style="position:relative;">'
            + '<button onclick="removeAniuzuContinue(' + Number(item.media_id) + ')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.7);border:none;color:white;width:44px;height:44px;border-radius:50%;cursor:pointer;z-index:10;font-size:14px;line-height:44px;text-align:center;" aria-label="Remove from continue watching">&#10005;</button>'
            + '<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.8);padding:4px 8px;border-radius:6px;font-size:12px;z-index:10;color:white;">Ep ' + ep + ' ' + _azCwHtmlEscape(variant.toUpperCase()) + '</div>'
            + '<a class="card-link" href="' + link + '">'
            + '<div class="card-poster">'
            + '<img loading="lazy" decoding="async" alt="' + _azCwHtmlEscape(titleText) + ' poster" src="' + _azCwHtmlEscape(item.poster || '') + '">'
            + '<span class="card-gradient"></span>'
            + '</div></a>'
            + progressBar
            + '</div>';
    }).join("");

    container.innerHTML = '<div class="az-content-section"><div class="az-slider-header"><h2 class="section-title">Continue Watching</h2><div class="az-slider-controls"><button aria-label="Scroll left" onclick="azSlideLeft(\'az-continue-slider\')"><span class="material-icons">chevron_left</span></button><button aria-label="Scroll right" onclick="azSlideRight(\'az-continue-slider\')"><span class="material-icons">chevron_right</span></button></div></div><div class="az-row" id="az-continue-slider">' + cardsHtml + '</div></div>';
}
