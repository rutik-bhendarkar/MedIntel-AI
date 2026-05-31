const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

// 🟢 Updated to the correct live Render URL
const REGISTER_API_URL = "https://medintel-ai-yszx.onrender.com/api/auth/register";

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const age = document.getElementById("age").value;
    const gender = document.getElementById("gender").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // =========================
    // VALIDATION
    // =========================

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

        const response = await fetch(REGISTER_API_URL, {
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

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage("Account created successfully", "success");
            registerForm.reset();

            setTimeout(() => {
                window.location.href = "login.html";
            }, 1500);
        } else {
            showMessage(data.message || "Registration failed", "error");
        }
    } catch (error) {
        console.log("Registration Fetch Error:", error);
        showMessage("Server connection failed", "error");
    }
});

// ====================================
// MESSAGE FUNCTION
// ====================================
function showMessage(message, type) {
    registerMessage.innerText = message;
    registerMessage.className = `auth-message ${type}`;
    registerMessage.style.display = "block";
}