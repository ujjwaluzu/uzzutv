/* =========================================================
   ANIUZU WATCHLIST
   Dedicated table: aniuzu_watchlist
   ========================================================= */

function _azWlHtmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function addAniuzuWatchlist(anilistId, title, poster) {
    try {
        var user = await getCurrentUser();
        if (!user) {
            window.location.href = "/auth/?next=/aniuzu/";
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
    } catch (e) {
        console.error("Error adding to anime watchlist:", e);
        return false;
    }
}


async function removeAniuzuWatchlist(anilistId) {
    try {
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
    } catch (e) {
        console.error("Error removing from anime watchlist:", e);
        return false;
    }
}


async function isInAniuzuWatchlist(anilistId) {
    try {
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
    } catch (e) {
        console.error("Error checking anime watchlist:", e);
        return false;
    }
}


async function getAniuzuWatchlistIds(ids) {
    if (!ids || ids.length === 0) return {};
    try {
        var user = await getCurrentUser();
        if (!user) return {};
        var { data, error } = await supabaseClient
            .from("aniuzu_watchlist")
            .select("media_id")
            .eq("user_id", user.id)
            .in("media_id", ids.map(Number));
        if (error || !data) return {};
        var set = {};
        data.forEach(function(row) { set[row.media_id] = true; });
        return set;
    } catch (e) {
        return {};
    }
}


async function toggleAniuzuWatchlist(anilistId, title, poster, button) {

    if (button) button.disabled = true;

    try {
        var user = await getCurrentUser();
        if (!user) {
            window.location.href = "/auth/?next=/aniuzu/";
            return;
        }

        var exists = await isInAniuzuWatchlist(anilistId);
        var isCard = button && button.classList.contains("az-card-watchlist");

        if (exists) {
            var removed = await removeAniuzuWatchlist(anilistId);
            if (removed && button) {
                button.innerHTML = isCard ? "&#65291;" : "&#65291; Add to Watchlist";
                button.classList.remove("in-watchlist");
            }
        } else {
            var added = await addAniuzuWatchlist(anilistId, title, poster);
            if (added && button) {
                button.innerHTML = isCard ? "&#10003;" : "&#10003; In Watchlist";
                button.classList.add("in-watchlist");
            }
        }
    } catch (e) {
        console.error("Error toggling watchlist:", e);
    }

    if (button) button.disabled = false;
}


async function updateAniuzuWatchlistButton(anilistId, button) {

    var user = await getCurrentUser();
    var isCard = button && button.classList.contains("az-card-watchlist");

    if (!user) {
        if (button) {
            button.innerHTML = isCard ? "&#65291;" : "&#65291; Add to Watchlist";
            button.classList.remove("in-watchlist");
        }
        return;
    }

    var exists = await isInAniuzuWatchlist(anilistId);

    if (!button) return;

    if (exists) {
        button.innerHTML = isCard ? "&#10003;" : "&#10003; In Watchlist";
        button.classList.add("in-watchlist");
    } else {
        button.innerHTML = isCard ? "&#65291;" : "&#65291; Add to Watchlist";
        button.classList.remove("in-watchlist");
    }
}


async function loadAniuzuWatchlist(containerId) {

    var container = document.getElementById(containerId);
    if (!container) return;

    try {
        var user = await getCurrentUser();

        if (!user) {
            container.innerHTML = '<div style="text-align:center;margin-top:50px;color:white;">'
                + '<h3>Please log in to view your watchlist.</h3>'
                + '<a href="/auth/?next=/aniuzu/" class="btn btn-outline-light mt-3">Login</a>'
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
            var link = "/aniuzu/anime/" + Number(item.media_id) + "/";
            return '<div class="az-card" style="position:relative;">'
                + '<button onclick="removeAniuzuWatchlistItem(' + Number(item.media_id) + ')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.75);border:none;color:white;width:44px;height:44px;border-radius:50%;cursor:pointer;z-index:10;line-height:44px;text-align:center;" aria-label="Remove from watchlist">&#10005;</button>'
                + '<a class="card-link" href="' + link + '">'
                + '<div class="card-poster">'
                + '<img loading="lazy" decoding="async" alt="' + _azWlHtmlEscape(item.title || "Anime") + ' poster" src="' + _azWlHtmlEscape(item.poster || '') + '">'
                + '<span class="card-gradient"></span>'
                + '</div></a>'
                + '<div class="card-info">'
                + '<div class="card-title">' + _azWlHtmlEscape(item.title || "Anime") + '</div>'
                + '</div>'
                + '</div>';
        }).join("");

        container.innerHTML = '<div class="az-row" id="az-watchlist-grid">' + cardsHtml + '</div>';
    } catch (e) {
        console.error("Error loading watchlist:", e);
        container.innerHTML = '<h3 style="text-align:center;margin-top:50px;color:white;">Unable to load your watchlist.</h3>';
    }
}


var _azWlRemoving = {};

async function removeAniuzuWatchlistItem(anilistId) {
    if (_azWlRemoving[anilistId]) return;
    _azWlRemoving[anilistId] = true;

    try {
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

        await loadAniuzuWatchlist("az-watchlist-container");
    } catch (e) {
        console.error("Error removing watchlist item:", e);
    } finally {
        delete _azWlRemoving[anilistId];
    }
}
