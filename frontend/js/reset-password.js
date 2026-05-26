document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "http://127.0.0.1:5000/api/auth";

    const requestForm = document.getElementById("requestResetForm");
    const completeForm = document.getElementById("completeResetForm");
    const emailInput = document.getElementById("resetEmail");
    const otpInput = document.getElementById("resetOtp");
    const newPasswordInput = document.getElementById("resetNewPassword");
    const confirmPasswordInput = document.getElementById("resetConfirmPassword");
    const requestButton = document.getElementById("requestResetButton");
    const completeButton = document.getElementById("completeResetButton");
    const requestMessage = document.getElementById("requestResetMessage");
    const completeMessage = document.getElementById("completeResetMessage");

    const params = new URLSearchParams(window.location.search);
    const emailFromQuery = params.get("email");

    if (emailFromQuery) {
        emailInput.value = emailFromQuery;
    }

    requestForm.addEventListener("submit", requestResetOtp);
    completeForm.addEventListener("submit", completeReset);

    async function requestResetOtp(event) {
        event.preventDefault();

        const email = emailInput.value.trim();

        if (!isValidEmail(email)) {
            showMessage(requestMessage, "Please enter a valid email address.", "error");
            return;
        }

        setLoading(requestButton, true, "Sending...");
        showMessage(requestMessage, "Sending reset OTP...", "loading");

        try {
            const response = await fetch(`${API_BASE}/password/forgot`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email })
            });
            const data = await readJsonResponse(response);

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to request reset code.");
            }

            const devOtpText = data.dev_otp
                ? ` Local development OTP: ${data.dev_otp}`
                : "";

            showMessage(requestMessage, `${data.message || "Check your email for the OTP."}${devOtpText}`, "success");
            otpInput.focus();
        } catch (error) {
            showMessage(requestMessage, error.message || "Unable to request reset code.", "error");
        } finally {
            setLoading(requestButton, false, "Send Reset OTP");
        }
    }

    async function completeReset(event) {
        event.preventDefault();

        const email = emailInput.value.trim();
        const otp = otpInput.value.trim();
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!isValidEmail(email)) {
            showMessage(completeMessage, "Please enter a valid email address first.", "error");
            return;
        }

        if (!/^\d{6}$/.test(otp)) {
            showMessage(completeMessage, "OTP must be 6 digits.", "error");
            return;
        }

        if (newPassword.length < 6) {
            showMessage(completeMessage, "Password must be at least 6 characters.", "error");
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage(completeMessage, "Passwords do not match.", "error");
            return;
        }

        setLoading(completeButton, true, "Resetting...");
        showMessage(completeMessage, "Resetting password...", "loading");

        try {
            const response = await fetch(`${API_BASE}/password/reset`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    otp,
                    new_password: newPassword
                })
            });
            const data = await readJsonResponse(response);

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to reset password.");
            }

            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");
            completeForm.reset();
            showMessage(completeMessage, data.message || "Password reset successfully.", "success");

            window.setTimeout(() => {
                window.location.href = "login.html";
            }, 1400);
        } catch (error) {
            showMessage(completeMessage, error.message || "Unable to reset password.", "error");
        } finally {
            setLoading(completeButton, false, "Reset Password");
        }
    }

    async function readJsonResponse(response) {
        const text = await response.text();

        if (!text) {
            return {};
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            return {
                message: "Backend returned a non-JSON response."
            };
        }
    }

    function showMessage(element, text, type) {
        element.textContent = text;
        element.className = `auth-message ${type}`;
        element.style.display = "block";
    }

    function setLoading(button, isLoading, label) {
        button.disabled = isLoading;
        button.textContent = label;
        emailInput.disabled = isLoading && button === requestButton;
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
});
