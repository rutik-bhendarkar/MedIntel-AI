document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const rememberMe = document.getElementById("rememberMe");
    const loginButton = loginForm.querySelector(".auth-btn");

    // 🟢 Updated to the correct live Render URL
    const API_URL = "https://medintel-ai-yszx.onrender.com/api/auth/login";

    const existingToken = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (existingToken) {
        window.location.href = "dashboard.html";
        return;
    }

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const remember = rememberMe ? rememberMe.checked : false;

        if (!email || !password) {
            showMessage("Please enter both email and password.", "error");
            return;
        }

        if (!isValidEmail(email)) {
            showMessage("Please enter a valid email address.", "error");
            return;
        }

        setLoading(true);
        showMessage("Checking credentials...", "loading");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showMessage(data.message || "Invalid email or password.", "error");
                setLoading(false);
                return;
            }

            const storage = remember ? localStorage : sessionStorage;

            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");

            storage.setItem("token", data.token);
            storage.setItem("user", JSON.stringify(data.user));

            showMessage(`Welcome back, ${data.user?.full_name || "User"}!`, "success");

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 900);
        } catch (error) {
            console.error(error);
            showMessage("Server connection failed. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    });

    function showMessage(text, type) {
        loginMessage.textContent = text;
        loginMessage.className = `auth-message ${type}`;
        loginMessage.style.display = "block";
    }

    function setLoading(isLoading) {
        loginButton.disabled = isLoading;
        loginButton.textContent = isLoading ? "Logging in..." : "Login to MedIntel AI";
        emailInput.disabled = isLoading;
        passwordInput.disabled = isLoading;
        if (rememberMe) rememberMe.disabled = isLoading;
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
});