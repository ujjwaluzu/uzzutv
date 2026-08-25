/* =========================================================
   ANIUZU WATCHLIST
   Dedicated table: aniuzu_watchlist
   ========================================================= */

function _azWlHtmlEscape(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

async function addAniuzuWatchlist(anilistId, title, poster) {

    var user = await getCurrentUser();
    if (!user) {
        window.location.href = "/auth/";
        return false;
    }

    var { error } = await supabaseClient
        .from("aniuzu_watchlist")
        .upsert(
            {
                user_id: user.id,
                media_id: Number(anilistId),
                title: title || "",
                poster: poster || ""
            },
            { onConflict: "user_id,media_id" }
        );

    if (error) {
        console.error("Error adding to anime watchlist:", error);
        return false;
    }

    return true;
}


async function removeAniuzuWatchlist(anilistId) {

    var user = await getCurrentUser();
    if (!user) return false;

    var { error } = await supabaseClient
        .from("aniuzu_watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("media_id", Number(anilistId));

    if (error) {
        console.error("Error removing from anime watchlist:", error);
        return false;
    }

    return true;
}


async function isInAniuzuWatchlist(anilistId) {

    var user = await getCurrentUser();
    if (!user) return false;

    var { data, error } = await supabaseClient
        .from("aniuzu_watchlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("media_id", Number(anilistId))
        .maybeSingle();

    if (error) {
        console.error("Error checking anime watchlist:", error);
        return false;
    }

    return !!data;
}


async function toggleAniuzuWatchlist(anilistId, title, poster, button) {

    var user = await getCurrentUser();
    if (!user) {
        window.location.href = "/auth/";
        return;
    }

    var exists = await isInAniuzuWatchlist(anilistId);

    if (exists) {
        var removed = await removeAniuzuWatchlist(anilistId);
        if (removed && button) {
            button.innerHTML = "&#65291; Add to Watchlist";
            button.classList.remove("in-watchlist");
        }
    } else {
        var added = await addAniuzuWatchlist(anilistId, title, poster);
        if (added && button) {
            button.innerHTML = "&#10003; In Watchlist";
            button.classList.add("in-watchlist");
        }
    }
}


async function updateAniuzuWatchlistButton(anilistId, button) {

    var user = await getCurrentUser();

    if (!user) {
        if (button) {
            button.innerHTML = "&#65291; Add to Watchlist";
            button.classList.remove("in-watchlist");
        }
        return;
    }

    var exists = await isInAniuzuWatchlist(anilistId);

    if (!button) return;

    if (exists) {
        button.innerHTML = "&#10003; In Watchlist";
        button.classList.add("in-watchlist");
    } else {
        button.innerHTML = "&#65291; Add to Watchlist";
        button.classList.remove("in-watchlist");
    }
}


async function loadAniuzuWatchlist(containerId) {

    var container = document.getElementById(containerId);
    if (!container) return;

    var user = await getCurrentUser();

    if (!user) {
        container.innerHTML = '<div style="text-align:center;margin-top:50px;color:white;">'
            + '<h3>Please log in to view your watchlist.</h3>'
            + '<a href="/auth/" class="btn btn-outline-light mt-3">Login</a>'
            + '</div>';
        return;
    }

    var { data, error } = await supabaseClient
        .from("aniuzu_watchlist")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error loading anime watchlist:", error);
        container.innerHTML = '<h3 style="text-align:center;margin-top:50px;color:white;">Unable to load your watchlist.</h3>';
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align:center;margin-top:50px;color:white;">'
            + '<h3>Your anime watchlist is empty</h3>'
            + '<p style="opacity:0.7;">Browse anime and add them to your watchlist.</p>'
            + '</div>';
        return;
    }

    var cardsHtml = data.map(function(item) {
        var link = "/aniuzu/anime/" + item.media_id + "/";
        return '<div class="az-card" style="position:relative;">'
            + '<button onclick="removeAniuzuWatchlistItem(\'' + item.media_id + '\')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.75);border:none;color:white;width:30px;height:30px;border-radius:50%;cursor:pointer;z-index:10;" title="Remove from watchlist">&#10005;</button>'
            + '<a class="card-link" href="' + link + '">'
            + '<div class="card-poster">'
            + '<img loading="lazy" decoding="async" alt="' + (item.title || "Anime") + ' poster" src="' + item.poster + '">'
            + '<span class="card-gradient"></span>'
            + '</div></a>'
            + '<div class="card-info">'
            + '<div class="card-title">' + _azWlHtmlEscape(item.title || "Anime") + '</div>'
            + '</div>'
            + '</div>';
    }).join("");

    container.innerHTML = '<div class="az-row" id="az-watchlist-grid">' + cardsHtml + '</div>';
}


async function removeAniuzuWatchlistItem(anilistId) {

    var user = await getCurrentUser();
    if (!user) return;

    var { error } = await supabaseClient
        .from("aniuzu_watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("media_id", Number(anilistId));

    if (error) {
        console.error("Error removing anime watchlist item:", error);
        return;
    }

    loadAniuzuWatchlist("az-watchlist-container");
}
