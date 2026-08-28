/* Resolve the Aniuzu detail-page action to the user's latest anime progress. */
(function () {
    "use strict";

    var button = document.getElementById("az-detail-watch");
    if (!button || typeof getCurrentUser !== "function" || typeof supabaseClient === "undefined") return;

    function applyResume(record) {
        if (!record) return;
        var episode = Number(record.episode_number);
        if (!Number.isInteger(episode) || episode < 1) return;
        var server = record.server === "tryembed" ? "tryembed" : "anilink";
        var variant = record.variant === "dub" ? "dub" : "sub";
        var position = Number(record.position);
        var resume = Number.isFinite(position) && position > 0 ? Math.floor(position) : 0;
        var href = "/aniuzu/anime/" + encodeURIComponent(button.dataset.anilistId) + "/watch/" + episode +
            "/?server=" + encodeURIComponent(server) + "&variant=" + encodeURIComponent(variant) +
            "&resume=1&resume_position=" + resume;
        button.href = href;
        var label = button.querySelector(".az-detail-watch-label");
        if (label) label.textContent = "Resume";
    }

    (async function () {
        try {
            var user = await getCurrentUser();
            if (!user) return;
            var result = await supabaseClient.from("aniuzu_continue_watching")
                .select("episode_number,server,variant,position")
                .eq("user_id", user.id)
                .eq("anilist_id", Number(button.dataset.anilistId))
                .maybeSingle();
            if (!result.error) applyResume(result.data);
        } catch (error) {
            // The normal Watch action remains available if history cannot load.
            console.warn("Unable to load Aniuzu resume state.");
        }
    }());
}());
