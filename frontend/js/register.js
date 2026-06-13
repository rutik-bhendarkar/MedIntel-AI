const API_BASE_URL = "http://localhost:5000";

const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const age = document.getElementById("age").value;
    const gender = document.getElementById("gender").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!full_name || !email || !password) {
        showMessage("Please fill all required fields", "error");
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Passwords do not match", "error");
        return;
    }

    if (password.length < 6) {
        showMessage("Password must be at least 6 characters", "error");
        return;
    }

    try {
        showMessage("Creating account...", "loading");

        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name,
                email,
                password,
                age,
                gender
            })
        });

        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            showMessage(data.message || "Registration failed", "error");
            return;
        }

        showMessage("Account created successfully", "success");
        registerForm.reset();

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);
    } catch (error) {
        console.error("Registration request failed:", error);
        showMessage(error.message || "Server connection failed", "error");
    }
});

function showMessage(message, type) {
    registerMessage.innerText = message;
    registerMessage.className = `auth-message ${type}`;
    registerMessage.style.display = "block";
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
