(function () {
    "use strict";
    var form = document.getElementById("forgot-form");
    if (!form) return;
    var email = document.getElementById("forgot-email");
    var submit = document.getElementById("forgot-submit");
    var message = document.getElementById("forgot-message");
    var feedback = document.getElementById("forgot-email-feedback");
    var next = new URLSearchParams(window.location.search).get("next") || "/home/";
    if (!/^\/(?!\/)/.test(next) || next.indexOf("\\") !== -1) next = "/home/";
    function show(text, type) { message.textContent = text; message.className = "alert alert-" + type + " auth-message"; }
    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        var value = email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { feedback.textContent = "Please enter a valid email address."; return; }
        feedback.textContent = ""; submit.disabled = true; submit.textContent = "Sending…";
        try {
            var redirectTo = window.location.origin + "/auth/reset-password/?next=" + encodeURIComponent(next);
            var result = await supabaseClient.auth.resetPasswordForEmail(value, { redirectTo: redirectTo });
            if (result.error) throw result.error;
            show("If an account exists for this email, a password reset link has been sent.", "success");
            form.reset();
        } catch (error) {
            console.error("Password reset request failed:", error);
            show("We couldn’t send the reset link right now. Please try again.", "danger");
        } finally { submit.disabled = false; submit.textContent = "Send Reset Link"; }
    });
}());
