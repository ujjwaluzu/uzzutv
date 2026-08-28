/* =========================================================
   WATCHLIST
========================================================= */

async function addToWatchlist(id, type, title, poster) {

    const user = await getCurrentUser();

    if (!user) {
        window.location.href = "/auth/?next=/home/";
        return false;
    }

    const { error } = await supabaseClient
        .from("watchlist")
        .upsert(
            {
                user_id: user.id,
                media_id: Number(id),
                media_type: type,
                title: title,
                poster: poster
            },
            {
                onConflict: "user_id,media_id,media_type"
            }
        );

    if (error) {
        console.error("Error adding to watchlist:", error);
        return false;
    }

    console.log("Added to watchlist:", id, type);

    return true;
}


async function removeFromWatchlist(id, type) {

    const user = await getCurrentUser();

    if (!user) {
        return false;
    }

    const { error } = await supabaseClient
        .from("watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("media_id", Number(id))
        .eq("media_type", type);

    if (error) {
        console.error("Error removing from watchlist:", error);
        return false;
    }

    console.log("Removed from watchlist:", id, type);

    return true;
}


async function isInWatchlist(id, type) {

    const user = await getCurrentUser();

    if (!user) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from("watchlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("media_id", Number(id))
        .eq("media_type", type)
        .maybeSingle();

    if (error) {
        console.error("Error checking watchlist:", error);
        return false;
    }

    return !!data;
}


async function toggleWatchlist(id, type, title, poster, button) {

    const user = await getCurrentUser();

    if (!user) {
        window.location.href = "/auth/?next=/home/";
        return;
    }

    if (button) button.disabled = true;

    const exists = await isInWatchlist(id, type);

    if (exists) {

        const removed = await removeFromWatchlist(id, type);

        if (removed && button) {
            button.innerHTML = "＋ Add Watchlist";
            button.classList.remove("in-watchlist");
        }

    } else {

        const added = await addToWatchlist(
            id,
            type,
            title,
            poster
        );

        if (added && button) {
            button.innerHTML = "✓ In Watchlist";
            button.classList.add("in-watchlist");
        }
    }

    if (button) button.disabled = false;
}


async function updateWatchlistButton(
    id,
    type,
    button
) {

    const user = await getCurrentUser();

    if (!user) {
        if (button) {
            button.innerHTML = "＋ Add Watchlist";
            button.classList.remove("in-watchlist");
        }
        return;
    }

    const exists = await isInWatchlist(id, type);

    if (!button) {
        return;
    }

    if (exists) {
        button.innerHTML = "✓ In Watchlist";
        button.classList.add("in-watchlist");
    } else {
        button.innerHTML = "＋ Add Watchlist";
        button.classList.remove("in-watchlist");
    }
}
