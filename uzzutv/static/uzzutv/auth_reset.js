(function () {
    "use strict";
    var form = document.getElementById("reset-form");
    if (!form) return;
    var password = document.getElementById("reset-password");
    var confirmPassword = document.getElementById("reset-confirm");
    var submit = document.getElementById("reset-submit");
    var message = document.getElementById("reset-message");
    var next = new URLSearchParams(window.location.search).get("next") || "/home/";
    if (!/^\/(?!\/)/.test(next) || next.indexOf("\\") !== -1) next = "/home/";
    var recoveryReady = false;
    var revealTimers = {};
    function show(text, type) { message.textContent = text; message.className = "alert alert-" + type + " auth-message"; }
    document.querySelectorAll(".password-toggle").forEach(function (button) {
        button.addEventListener("click", function () {
            var target = document.getElementById(button.dataset.passwordTarget);
            if (!target) return;
            clearTimeout(revealTimers[button.dataset.passwordTarget]);
            target.type = "text";
            button.setAttribute("aria-label", "Password visible for 2 seconds");
            var icon = button.querySelector(".material-icons");
            if (icon) icon.textContent = "visibility_off";
            revealTimers[button.dataset.passwordTarget] = setTimeout(function () {
                target.type = "password";
                button.setAttribute("aria-label", "Show password");
                if (icon) icon.textContent = "visibility";
            }, 2000);
        });
    });
    function passwordError(value) {
        if (!value || value.length < 6) return "Password must be at least 6 characters.";
        if (!/[A-Za-z]/.test(value)) return "Password must contain at least one letter.";
        if (!/[0-9]/.test(value)) return "Password must contain at least one number.";
        return "";
    }
    async function prepareRecovery() {
        var hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
        var hasRecoveryHash = hash.get("type") === "recovery" || (hash.has("access_token") && hash.has("refresh_token"));
        var flagged = false;
        try {
            var recoveryAt = Number(sessionStorage.getItem("uzzutv_password_recovery_at"));
            flagged = sessionStorage.getItem("uzzutv_password_recovery") === "1" && Number.isFinite(recoveryAt) && Date.now() - recoveryAt < 3600000;
        } catch (error) {}
        var code = new URLSearchParams(window.location.search).get("code");
        try {
            if (code && typeof supabaseClient.auth.exchangeCodeForSession === "function") await supabaseClient.auth.exchangeCodeForSession(code);
            var result = await supabaseClient.auth.getSession();
            recoveryReady = !!(result.data && result.data.session && (hasRecoveryHash || flagged));
        } catch (error) { recoveryReady = false; }
        if (!recoveryReady) { show("This password reset link is invalid or has expired. Please request a new password reset email.", "danger"); submit.disabled = true; }
        else submit.disabled = false;
    }

    supabaseClient.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY" && session) {
            recoveryReady = true;
            submit.disabled = false;
        }
    });
    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!recoveryReady) return;
        var validation = passwordError(password.value);
        if (validation) { show(validation, "danger"); return; }
        if (password.value !== confirmPassword.value) { show("Passwords do not match.", "danger"); return; }
        submit.disabled = true; submit.textContent = "Updating…";
        try {
            var result = await supabaseClient.auth.updateUser({ password: password.value });
            if (result.error) throw result.error;
            try {
                sessionStorage.removeItem("uzzutv_password_recovery");
                sessionStorage.removeItem("uzzutv_password_recovery_at");
            } catch (error) {}
            if (window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            show("Your password has been updated successfully.", "success");
            setTimeout(function () { window.location.replace(next); }, 900);
        } catch (error) {
            console.error("Password update failed:", error);
            show("We couldn’t update your password. The link may have expired; please request a new one.", "danger");
            submit.disabled = false; submit.textContent = "Update Password";
        }
    });
    prepareRecovery();
}());
