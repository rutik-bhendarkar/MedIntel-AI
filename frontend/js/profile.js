document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "https://medintel-ai-yszx.onrender.com/api/auth";

    const status = document.getElementById("profilePageStatus");
    const avatar = document.getElementById("profileAvatar");
    const displayName = document.getElementById("profileDisplayName");
    const displayEmail = document.getElementById("profileDisplayEmail");
    const copyEmailButton = document.getElementById("copyProfileEmailButton");
    const verificationBadge = document.getElementById("profileVerificationBadge");
    const accountStatus = document.getElementById("profileAccountStatus");
    const ageValue = document.getElementById("profileAgeValue");
    const genderValue = document.getElementById("profileGenderValue");
    const joinedValue = document.getElementById("profileJoinedValue");
    const lastLoginValue = document.getElementById("profileLastLoginValue");

    const profileForm = document.getElementById("profileForm");
    const fullNameInput = document.getElementById("profileFullName");
    const emailInput = document.getElementById("profileEmail");
    const ageInput = document.getElementById("profileAge");
    const genderInput = document.getElementById("profileGender");
    const themePreferenceInput = document.getElementById("profileThemePreference");
    const notificationsInput = document.getElementById("profileNotifications");
    const medicalRemindersInput = document.getElementById("profileMedicalReminders");
    const chronicConditionsInput = document.getElementById("profileChronicConditions");
    const allergiesInput = document.getElementById("profileAllergies");
    const emergencyContactInput = document.getElementById("profileEmergencyContact");
    const medicalHistoryInput = document.getElementById("profileMedicalHistory");
    const saveProfileButton = document.getElementById("saveProfileButton");
    const resetProfileButton = document.getElementById("resetProfileButton");

    const changePasswordForm = document.getElementById("changePasswordForm");
    const currentPasswordInput = document.getElementById("currentPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
    const changePasswordButton = document.getElementById("changePasswordButton");
    const changePasswordStatus = document.getElementById("changePasswordStatus");

    const forgotPasswordLink = document.getElementById("forgotPasswordLink");
    const logoutButton = document.getElementById("profileLogoutButton");
    const deactivateButton = document.getElementById("deactivateAccountButton");
    const deactivateStatus = document.getElementById("deactivateStatus");

    let currentUser = null;

    const auth = getAuth();

    if (!auth.token) {
        redirectToLogin();
        return;
    }

    loadProfile();

    profileForm?.addEventListener("submit", saveProfile);
    resetProfileButton?.addEventListener("click", () => renderProfile(currentUser));
    changePasswordForm?.addEventListener("submit", changePassword);
    copyEmailButton?.addEventListener("click", copyEmail);
    logoutButton?.addEventListener("click", logout);
    deactivateButton?.addEventListener("click", deactivateAccount);

    async function loadProfile() {
        setStatus("Loading profile...", "");
        setProfileLoading(true);

        try {
            const response = await authFetch("/me");
            const data = await readJsonResponse(response);

            if (response.status === 401) {
                clearAuth();
                redirectToLogin();
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load profile.");
            }

            currentUser = data.user;
            renderProfile(currentUser);
            persistUser(currentUser);
            setStatus("Profile loaded.", "success");
        } catch (error) {
            setStatus(error.message || "Unable to load profile.", "error");
        } finally {
            setProfileLoading(false);
        }
    }

    async function saveProfile(event) {
        event.preventDefault();

        const payload = {
            full_name: fullNameInput.value.trim(),
            age: ageInput.value,
            gender: genderInput.value,
            theme_preference: themePreferenceInput.value,
            notifications_enabled: notificationsInput.checked,
            medical_reminders_enabled: medicalRemindersInput.checked,
            chronic_conditions: chronicConditionsInput.value.trim(),
            allergies: allergiesInput.value.trim(),
            emergency_contact: emergencyContactInput.value.trim(),
            medical_history: medicalHistoryInput.value.trim()
        };

        if (!payload.full_name) {
            setStatus("Full name is required.", "error");
            return;
        }

        setProfileLoading(true);
        setStatus("Saving profile...", "");

        try {
            const response = await authFetch("/me", {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            const data = await readJsonResponse(response);

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to update profile.");
            }

            currentUser = data.user;
            renderProfile(currentUser);
            persistUser(currentUser);
            setStatus(data.message || "Profile updated successfully.", "success");
        } catch (error) {
            setStatus(error.message || "Unable to update profile.", "error");
        } finally {
            setProfileLoading(false);
        }
    }

    async function changePassword(event) {
        event.preventDefault();

        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmNewPasswordInput.value;

        if (!currentPassword || !newPassword) {
            setInlineStatus(changePasswordStatus, "Current and new password are required.", "error");
            return;
        }

        if (newPassword.length < 6) {
            setInlineStatus(changePasswordStatus, "New password must be at least 6 characters.", "error");
            return;
        }

        if (newPassword !== confirmPassword) {
            setInlineStatus(changePasswordStatus, "New passwords do not match.", "error");
            return;
        }

        setButtonLoading(changePasswordButton, true, "Changing...");
        setInlineStatus(changePasswordStatus, "Changing password...", "");

        try {
            const response = await authFetch("/password/change", {
                method: "POST",
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            });
            const data = await readJsonResponse(response);

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to change password.");
            }

            changePasswordForm.reset();
            setInlineStatus(changePasswordStatus, data.message || "Password changed successfully.", "success");
        } catch (error) {
            setInlineStatus(changePasswordStatus, error.message || "Unable to change password.", "error");
        } finally {
            setButtonLoading(changePasswordButton, false, "Change Password");
        }
    }

    async function copyEmail() {
        if (!currentUser?.email) {
            return;
        }

        try {
            await copyText(currentUser.email);
            setStatus("Email copied to clipboard.", "success");
        } catch (error) {
            setStatus("Could not copy email.", "error");
        }
    }

    async function logout() {
        try {
            await authFetch("/logout", { method: "POST" });
        } catch (error) {
            // JWT logout is completed locally even if the network is unavailable.
        } finally {
            clearAuth();
            window.location.href = "login.html";
        }
    }

    async function deactivateAccount() {
        const confirmed = window.confirm("Deactivate your account? You will be logged out immediately.");

        if (!confirmed) {
            return;
        }

        setButtonLoading(deactivateButton, true, "Deactivating...");
        setInlineStatus(deactivateStatus, "Deactivating account...", "");

        try {
            const response = await authFetch("/me/deactivate", { method: "PUT" });
            const data = await readJsonResponse(response);

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to deactivate account.");
            }

            clearAuth();
            window.location.href = "login.html";
        } catch (error) {
            setInlineStatus(deactivateStatus, error.message || "Unable to deactivate account.", "error");
        } finally {
            setButtonLoading(deactivateButton, false, "Deactivate Account");
        }
    }

    function renderProfile(user) {
        if (!user) {
            return;
        }

        const name = user.full_name || user.username || "User";
        const email = user.email || "-";

        setText(displayName, name);
        setText(displayEmail, email);
        setText(avatar, getInitials(name));
        setText(ageValue, formatValue(user.age));
        setText(genderValue, formatValue(user.gender));
        setText(joinedValue, formatDate(user.created_at));
        setText(lastLoginValue, formatDate(user.last_login));

        if (verificationBadge) {
            verificationBadge.textContent = user.is_verified ? "Verified" : "Unverified";
            verificationBadge.className = user.is_verified ? "risk-chip low" : "risk-chip neutral";
        }

        if (accountStatus) {
            accountStatus.textContent = formatValue(user.account_status || "active");
        }

        fullNameInput.value = name === "User" ? "" : name;
        emailInput.value = user.email || "";
        ageInput.value = user.age ?? "";
        genderInput.value = user.gender || "";
        themePreferenceInput.value = user.theme_preference || "light";
        notificationsInput.checked = Boolean(user.notifications_enabled);
        medicalRemindersInput.checked = Boolean(user.medical_reminders_enabled);
        chronicConditionsInput.value = user.chronic_conditions || "";
        allergiesInput.value = user.allergies || "";
        emergencyContactInput.value = user.emergency_contact || "";
        medicalHistoryInput.value = user.medical_history || "";

        if (forgotPasswordLink) {
            forgotPasswordLink.href = `reset-password.html?email=${encodeURIComponent(user.email || "")}`;
        }
    }

    function getAuth() {
        const localToken = localStorage.getItem("token");
        const sessionToken = sessionStorage.getItem("token");

        if (localToken) {
            return {
                token: localToken,
                storage: localStorage
            };
        }

        if (sessionToken) {
            return {
                token: sessionToken,
                storage: sessionStorage
            };
        }

        return {
            token: "",
            storage: localStorage
        };
    }

    function authFetch(path, options = {}) {
        return fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${auth.token}`,
                ...(options.headers || {})
            }
        });
    }

    function persistUser(user) {
        if (!user) {
            return;
        }

        auth.storage.setItem("user", JSON.stringify(user));
    }

    function clearAuth() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
    }

    function redirectToLogin() {
        window.location.href = "login.html";
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

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
    }

    function getInitials(name) {
        const parts = String(name || "User")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);

        return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "U";
    }

    function formatDate(value) {
        if (!value) {
            return "-";
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? formatValue(value) : date.toLocaleString();
    }

    function formatValue(value) {
        return value === null || value === undefined || value === "" ? "-" : String(value);
    }

    function setText(element, value) {
        if (element) {
            element.textContent = value;
        }
    }

    function setStatus(message, type) {
        setInlineStatus(status, message, type);
    }

    function setInlineStatus(element, message, type) {
        if (!element) {
            return;
        }

        element.textContent = message;
        element.className = `status-message ${element.classList.contains("compact") ? "compact " : ""}${type || ""}`.trim();
    }

    function setButtonLoading(button, isLoading, label) {
        if (!button) {
            return;
        }

        button.disabled = isLoading;
        button.textContent = label;
    }

    function setProfileLoading(isLoading) {
        setButtonLoading(saveProfileButton, isLoading, isLoading ? "Saving..." : "Save Profile");
        if (resetProfileButton) {
            resetProfileButton.disabled = isLoading;
        }
    }
});
