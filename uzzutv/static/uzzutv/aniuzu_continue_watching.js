/* =========================================================
   ANIUZU CONTINUE WATCHING
   Dedicated table: aniuzu_continue_watching
   ========================================================= */

function _azCwHtmlEscape(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

async function saveAniuzuContinue(anilistId, episode, variant, poster, title) {

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
                updated_at: new Date().toISOString()
            },
            { onConflict: "user_id,media_id" }
        );

    if (error) {
        console.error("Error saving anime continue watching:", error);
    }
}


async function getAllAniuzuContinue() {

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
}


async function removeAniuzuContinue(anilistId) {

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

    renderAniuzuContinueHome("continue-anime");
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
        var ep = item.episode || 1;
        var variant = item.variant || "sub";
        var link = "/aniuzu/anime/" + item.media_id + "/watch/" + ep + "/?variant=" + variant;
        var titleText = item.title || "Continue Watching";
        return '<div class="az-card" style="position:relative;">'
            + '<button onclick="removeAniuzuContinue(' + item.media_id + ')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.7);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;z-index:10;font-size:14px;line-height:28px;text-align:center;">&#10005;</button>'
            + '<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.8);padding:4px 8px;border-radius:6px;font-size:12px;z-index:10;color:white;">Ep ' + ep + ' ' + variant.toUpperCase() + '</div>'
            + '<a class="card-link" href="' + link + '">'
            + '<div class="card-poster">'
            + '<img loading="lazy" decoding="async" src="' + item.poster + '">'
            + '<span class="card-gradient"></span>'
            + '</div></a>'
            + '<div class="card-info"><div class="card-title" style="font-size:12px;">' + _azCwHtmlEscape(titleText) + '</div></div>'
            + '</div>';
    }).join("");

    container.innerHTML = '<div class="az-content-section"><div class="az-slider-header"><h2 class="section-title">Continue Watching</h2><div class="az-slider-controls"><button onclick="azSlideLeft(\'az-continue-slider\')"><span class="material-icons">chevron_left</span></button><button onclick="azSlideRight(\'az-continue-slider\')"><span class="material-icons">chevron_right</span></button></div></div><div class="az-row" id="az-continue-slider">' + cardsHtml + '</div></div>';
}
