const SUPABASE_URL = "https://mmtmpsomnjjsveybirtl.supabase.co";
const SUPABASE_KEY = "sb_publishable_2bgeKFB31VSLyZCYwdvUaQ_bRNsa_gO";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


async function updateAuthNavbar() {

    const loginNav = document.getElementById("login-nav");
    const accountNav = document.getElementById("account-nav");
    const userUsername = document.getElementById("user-username");
    const partyNav = document.getElementById("party-nav-item");
    const azWatchlistNav = document.getElementById("az-watchlist-nav");

    if (!loginNav || !accountNav) {
        return;
    }

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();


    if (user) {

        /* Logged in */

        loginNav.classList.add("d-none");
        accountNav.classList.remove("d-none");

        if (partyNav) {
            partyNav.classList.remove("d-none");
        }

        if (azWatchlistNav) {
            azWatchlistNav.classList.remove("d-none");
        }

        if (userUsername) {

            const profile = await ensureUserProfile(user);

            if (profile && profile.username) {

                const link = document.createElement("a");

                link.href = "/profile/";
                link.className = "navbar-text text-white text-decoration-none";

                link.innerHTML =
                    `<span class="material-icons" style="font-size:18px;vertical-align:-3px;">person</span> ${profile.username}`;

                link.addEventListener("mouseenter", () => {
                    link.style.color = "#ff3c3c";
                });

                link.addEventListener("mouseleave", () => {
                    link.style.color = "";
                });

                userUsername.innerHTML = "";
                userUsername.appendChild(link);

            } else {

                const link = document.createElement("a");

                link.href = "/profile/";
                link.className = "navbar-text text-white text-decoration-none";

                link.innerHTML = "Complete Profile";

                link.addEventListener("mouseenter", () => {
                    link.style.color = "#ff3c3c";
                });

                link.addEventListener("mouseleave", () => {
                    link.style.color = "";
                });

                userUsername.innerHTML = "";
                userUsername.appendChild(link);
            }

        }

    } else {

        /* Logged out */

        loginNav.classList.remove("d-none");
        accountNav.classList.add("d-none");

        if (partyNav) {
            partyNav.classList.add("d-none");
        }

        if (azWatchlistNav) {
            azWatchlistNav.classList.add("d-none");
        }

    }

}


/* =========================================================
   BACK TO TOP
========================================================= */

window.addEventListener("DOMContentLoaded", () => {

    const backToTopBtn = document.getElementById("back-to-top");

    if (backToTopBtn) {

        backToTopBtn.addEventListener("click", () => {

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        });

    }

});


/* =========================================================
   LOGOUT
========================================================= */

document.addEventListener("click", async (event) => {

    if (event.target.id !== "logout-btn") {
        return;
    }

    const { error } = await supabaseClient.auth.signOut();

    if (error) {

        console.error("Logout error:", error);

        return;
    }

    window.location.href = "/home/";

});


/* =========================================================
   AUTH STATE CHANGES
========================================================= */

supabaseClient.auth.onAuthStateChange(
    (event, session) => {

        updateAuthNavbar();

    }
);


/* =========================================================
   INITIAL CHECK
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    updateAuthNavbar
);


/* =========================================================
   GET CURRENT USER
========================================================= */

async function getCurrentUser() {

    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
        return null;
    }

    return data.user;
}


/* =========================================================
   PROFILE / USERNAME HELPERS
========================================================= */

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;


function validateUsername(username) {

    const value = (username || "").trim();

    if (!value) {
        return { valid: false, message: "Username is required." };
    }

    if (value.length < 3 || value.length > 20) {
        return {
            valid: false,
            message: "Username must be between 3 and 20 characters."
        };
    }

    if (!USERNAME_PATTERN.test(value)) {
        return {
            valid: false,
            message: "Username can only contain letters, numbers and underscores (no spaces)."
        };
    }

    return { valid: true, value };
}


async function getProfileByUserId(userId) {

    if (!userId) return null;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("id,username,avatar_url,created_at,updated_at")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        console.error("Error loading profile:", error);
        return null;
    }

    return data;
}


async function usernameAvailable(username) {

    const value = (username || "").trim();

    if (!validateUsername(value).valid) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("id")
        .eq("username", value)
        .maybeSingle();

    if (error) {
        console.error("Error checking username:", error);
        return null;
    }

    return !data;
}


async function createUserProfile(user, username) {

    const value = (username || "").trim();

    const check = validateUsername(value);

    if (!check.valid) {
        return { profile: null, error: check.message };
    }

    const { data, error } = await supabaseClient
        .from("profiles")
        .insert({
            id: user.id,
            username: value
        })
        .select()
        .single();

    if (error) {

        const message = String(error.message || "").toLowerCase();

        if (
            message.includes("duplicate") ||
            message.includes("already") ||
            message.includes("unique") ||
            message.includes("23505")
        ) {
            return {
                profile: null,
                error: "Username already taken."
            };
        }

        return {
            profile: null,
            error: "Unable to save your username. Please try again."
        };
    }

    return { profile: data, error: null };
}


async function ensureUserProfile(user) {

    if (!user) {
        return null;
    }

    const existing = await getProfileByUserId(user.id);

    if (existing) {
        return existing;
    }

    /* Try to auto-create from signup metadata */

    const metaUsername =
        (user.user_metadata && user.user_metadata.username)
            ? String(user.user_metadata.username).trim()
            : "";

    if (metaUsername && validateUsername(metaUsername).valid) {

        const available = await usernameAvailable(metaUsername);

        if (available === true) {

            const { profile, error } =
                await createUserProfile(user, metaUsername);

            if (profile) {
                return profile;
            }

            console.warn("Auto profile creation failed:", error);
        }
    }

    return null;

}
