/* =========================================================
   SAVE MOVIE
========================================================= */

async function saveContinue(id, type, poster) {

    const user = await getCurrentUser();

    if (!user) {
        console.log("User not logged in. Movie not saved.");
        return;
    }

    const { error } = await supabaseClient
        .from("continue_watching")
        .upsert(
            {
                user_id: user.id,
                media_id: Number(id),
                media_type: type,
                poster: poster,
                season: null,
                episode: null,
                updated_at: new Date().toISOString()
            },
            {
                onConflict: "user_id,media_id,media_type"
            }
        );

    if (error) {
        console.error("Error saving movie:", error);
    } else {
        console.log("Movie saved:", id);
    }
}


/* =========================================================
   SAVE TV
========================================================= */

async function saveContinueTV(id, poster, season, episode) {

    const user = await getCurrentUser();

    if (!user) {
        console.log("User not logged in. TV show not saved.");
        return;
    }

    const { error } = await supabaseClient
        .from("continue_watching")
        .upsert(
            {
                user_id: user.id,
                media_id: Number(id),
                media_type: "tv",
                poster: poster,
                season: Number(season),
                episode: Number(episode),
                updated_at: new Date().toISOString()
            },
            {
                onConflict: "user_id,media_id,media_type"
            }
        );

    if (error) {
        console.error("Error saving TV:", error);
    } else {
        console.log(
            "TV saved:",
            id,
            "S" + season,
            "E" + episode
        );
    }
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

    return data || [];
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

                    <button onclick="slideLeft('${containerId}-slider')">
                        ❮
                    </button>

                    <button onclick="slideRight('${containerId}-slider')">
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
                            onclick="removeContinueTV('${item.media_id}')"
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


                        <a href="/tv/${item.media_id}/watch?season=${item.season}&episode=${item.episode}">

                            <img
                                loading="lazy"
                                decoding="async"
                                src="https://image.tmdb.org/t/p/w342${item.poster}"
                            >

                        </a>

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

                    <button onclick="slideLeft('${containerId}-slider')">
                        ❮
                    </button>

                    <button onclick="slideRight('${containerId}-slider')">
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
                            onclick="removeContinueMovie('${item.media_id}')"
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

                        <a href="/movie/${item.media_id}/watch">

                            <img
                                loading="lazy"
                                decoding="async"
                                src="https://image.tmdb.org/t/p/w342${item.poster}"
                            >

                        </a>

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

    const list = await getAllContinue();

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

                    <button onclick="slideLeft('${containerId}-slider')">
                        ❮
                    </button>

                    <button onclick="slideRight('${containerId}-slider')">
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
                            onclick="removeMixed('${item.media_id}', '${item.media_type}')"
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
                            ? `/movie/${item.media_id}/watch`
                            : `/tv/${item.media_id}/watch?season=${item.season}&episode=${item.episode}`
                        }">

                            <img
                                loading="lazy"
                                decoding="async"
                                src="https://image.tmdb.org/t/p/w342${item.poster}"
                            >

                        </a>

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
