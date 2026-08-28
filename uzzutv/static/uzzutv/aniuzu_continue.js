/* Authenticated Aniuzu home history. It deliberately uses the Aniuzu-only
   table, so UzzUTV movie/TV Continue Watching remains unchanged. */
(function () {
    "use strict";

    var LIMIT = 12;

    function escapeHtml(value) {
        var node = document.createElement("div");
        node.textContent = String(value || "");
        return node.innerHTML;
    }

    function percentage(record) {
        var value = Number(record.progress_percent);
        if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
        var position = Number(record.position), duration = Number(record.duration);
        return Number.isFinite(position) && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : 0;
    }

    function formatRemaining(record) {
        var duration = Number(record.duration), position = Number(record.position);
        if (!Number.isFinite(duration) || !Number.isFinite(position) || duration <= position) return Math.round(percentage(record)) + "% watched";
        var seconds = Math.round(duration - position);
        var minutes = Math.ceil(seconds / 60);
        return minutes >= 60 ? Math.floor(minutes / 60) + "h " + (minutes % 60) + "m left" : minutes + "m left";
    }

    async function getMetadata(ids) {
        var response = await fetch("/aniuzu/continue-metadata/?ids=" + encodeURIComponent(ids.join(",")), { credentials: "same-origin" });
        if (!response.ok) throw new Error("metadata request failed");
        var data = await response.json();
        var output = {};
        (data.items || []).forEach(function (item) { output[Number(item.id)] = item; });
        return output;
    }

    function watchUrl(record) {
        var savedPosition = Number(record.position);
        var resumePosition = Number.isFinite(savedPosition) && savedPosition > 0 ? Math.floor(savedPosition) : 0;
        return "/aniuzu/anime/" + Number(record.anilist_id) + "/watch/" + Number(record.episode_number) + "/?server=" + encodeURIComponent(record.server === "tryembed" ? "tryembed" : "anilink") + "&variant=" + encodeURIComponent(record.variant === "dub" ? "dub" : "sub") + "&resume=1&resume_position=" + resumePosition;
    }

    function render(container, records, metadata) {
        var cards = records.map(function (record) {
            var meta = metadata[Number(record.anilist_id)];
            if (!meta) return "";
            var season = meta.season && meta.seasonYear ? "Season " + String(meta.season).charAt(0) + String(meta.season).slice(1).toLowerCase() + " " + meta.seasonYear : "Season unavailable";
            var progress = percentage(record);
            return '<div class="az-continue-card"><a class="az-continue-link" href="' + watchUrl(record) + '"><div class="az-continue-poster">' +
                '<img loading="lazy" decoding="async" src="' + escapeHtml(meta.poster) + '" alt="' + escapeHtml(meta.title) + ' poster">' +
                '<span class="az-continue-progress"><i style="width:' + progress.toFixed(2) + '%"></i></span></div>' +
                '<div class="az-continue-info"><h3>' + escapeHtml(meta.title) + '</h3><p>' + escapeHtml(season) + ' · Episode ' + Number(record.episode_number) + '</p><span>' + escapeHtml(formatRemaining(record)) + '</span></div></a>' +
                '<button type="button" class="az-continue-remove" data-anilist-id="' + Number(record.anilist_id) + '" data-episode="' + Number(record.episode_number) + '" aria-label="Remove from Continue Watching">×</button></div>';
        }).join("");
        if (!cards) return;
        container.innerHTML = '<div class="az-slider-header"><h2 class="section-title">Continue Watching</h2></div><div class="az-continue-row">' + cards + '</div>';
    }

    async function load() {
        var container = document.getElementById("az-continue-watching");
        if (!container || typeof getCurrentUser !== "function") return;
        try {
            var user = await getCurrentUser();
            if (!user) return;
            var result = await supabaseClient.from("aniuzu_continue_watching").select("anilist_id,episode_number,variant,server,position,duration,progress_percent,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(LIMIT);
            if (result.error || !result.data || !result.data.length) return;
            var metadata = await getMetadata(result.data.map(function (record) { return Number(record.anilist_id); }));
            render(container, result.data, metadata);
        } catch (error) {
            console.warn("Unable to load Aniuzu Continue Watching.");
        }
    }

    async function removeRecord(button) {
        try {
            var user = await getCurrentUser();
            if (!user) return;
            button.disabled = true;
            var result = await supabaseClient.from("aniuzu_continue_watching").delete()
                .eq("user_id", user.id)
                .eq("anilist_id", Number(button.dataset.anilistId))
                .eq("episode_number", Number(button.dataset.episode));
            if (result.error) throw result.error;
            var card = button.closest(".az-continue-card");
            if (card) card.remove();
            var container = document.getElementById("az-continue-watching");
            if (container && !container.querySelector(".az-continue-card")) container.textContent = "";
        } catch (error) {
            button.disabled = false;
            console.warn("Unable to remove Aniuzu Continue Watching item.");
        }
    }

    document.addEventListener("click", function (event) {
        var button = event.target.closest(".az-continue-remove");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        removeRecord(button);
    });
    document.addEventListener("DOMContentLoaded", load);
}());
