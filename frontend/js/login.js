document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const rememberMe = document.getElementById("rememberMe");
    const loginButton = loginForm.querySelector(".auth-btn");

    const API_BASE_URL = "https://medintel-ai-dw5w.onrender.com";

    function parseJwt(token) {
        if (!token) return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        try {
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    function isTokenValid(token) {
        const p = parseJwt(token);
        if (!p) return false;
        if (p.exp && typeof p.exp === 'number') {
            const now = Math.floor(Date.now() / 1000);
            if (p.exp <= now) return false;
        }
        return true;
    }

    function clearAuthStorage() {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
        } catch (e) {}
    }

    const existingToken = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (existingToken) {
        if (isTokenValid(existingToken)) {
            window.location.href = "dashboard.html";
            return;
        }

        // token present but invalid/expired/malformed -> clear it and stay on login
        clearAuthStorage();
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
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await parseJsonResponse(response);

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

            showMessage(`Welcome back, ${data.user?.full_name || data.user?.email || "User"}!`, "success");

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

    async function parseJsonResponse(response) {
        try {
            return await response.json();
        } catch (error) {
            return {
                success: false,
                message: response.ok
                    ? "Invalid server response"
                    : `Request failed with status ${response.status}`
            };
        }
    }
});
