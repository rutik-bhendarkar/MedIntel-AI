const bcrypt = require("bcryptjs"); // Matches your server.js installation package
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Use the global db created in server.js, with fallback for direct imports.
const db = global.db || require("../config/db");

let userColumnsCache = null;
let resetTableReady = false;

// 🟢 Postgres Wrapper Utility
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) {
                reject(err);
                return;
            }
            // Postgres stores dataset rows inside the .rows property
            resolve(results.rows || results);
        });
    });
}

async function getUserColumns() {
    if (userColumnsCache) {
        return userColumnsCache;
    }

    // Use information_schema in Postgres to list columns for compatibility
    const rows = await query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
    );

    userColumnsCache = new Set(rows.map((r) => r.column_name).filter(Boolean));
    return userColumnsCache;
}

async function ensurePasswordResetTable() {
    if (resetTableReady) {
        return;
    }

    // Postgres-compatible table definition.
    await query(`
        CREATE TABLE IF NOT EXISTS password_reset_otps (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            email VARCHAR(255) NOT NULL,
            otp_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create indexes if they do not exist
    await query("CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_otps (user_id)");
    await query("CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_otps (email)");
    await query("CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_otps (expires_at)");

    resetTableReady = true;
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    const value = String(password || "");
    if (value.length < 6) {
        return "Password must be at least 6 characters";
    }
    return "";
}

function toNullableString(value, maxLength = 1000) {
    if (value === null || value === undefined) {
        return null;
    }
    const text = String(value).trim();
    return text ? text.slice(0, maxLength) : null;
}

function parseBoolean(value, fallback = false) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value === 1;
    }
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function sanitizeAge(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const age = Number(value);
    if (!Number.isInteger(age) || age < 0 || age > 130) {
        return undefined;
    }
    return age;
}

function sanitizeGender(value) {
    const gender = toNullableString(value, 40);
    if (!gender) {
        return null;
    }
    const allowed = ["Male", "Female", "Other", "Prefer not to say"];
    return allowed.includes(gender) ? gender : gender.slice(0, 40);
}

function sanitizeThemePreference(value) {
    const theme = String(value || "light").trim().toLowerCase();
    return ["light", "dark", "system"].includes(theme) ? theme : "light";
}

function isInactiveUser(user) {
    return Number(user.is_active) === 0 || String(user.account_status || "").toLowerCase() === "deactivated";
}

function buildSafeUserProfile(user = {}) {
    const isVerified = parseBoolean(user.is_verified, false);
    const notificationsEnabled = parseBoolean(user.notifications_enabled, true);
    const remindersEnabled = parseBoolean(user.medical_reminders_enabled, false);
    const isActive = Number(user.is_active ?? 1) !== 0;

    return {
        id: user.id,
        full_name: user.full_name || user.username || "",
        username: user.username || user.full_name || "",
        email: user.email || "",
        age: user.age ?? null,
        gender: user.gender || null,
        is_verified: isVerified,
        verification_status: isVerified ? "Verified" : "Unverified",
        created_at: user.created_at || null,
        last_login: user.last_login || null,
        profile_image: user.profile_image || null,
        theme_preference: user.theme_preference || "light",
        notifications_enabled: notificationsEnabled,
        medical_reminders_enabled: remindersEnabled,
        chronic_conditions: user.chronic_conditions || "",
        allergies: user.allergies || "",
        emergency_contact: user.emergency_contact || "",
        medical_history: user.medical_history || "",
        account_status: user.account_status || (isActive ? "active" : "deactivated"),
        is_active: isActive
    };
}

// 🟢 Changed placeholders to $1
async function findUserByEmail(email) {
    const rows = await query("SELECT * FROM users WHERE email = $1 LIMIT 1", [normalizeEmail(email)]);
    return rows[0] || null;
}

// 🟢 Changed placeholders to $1
async function findUserById(id) {
    const rows = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
    return rows[0] || null;
}

// 🟢 Changed placeholders to $1
async function updateLastLoginIfAvailable(userId) {
    try {
        const columns = await getUserColumns();
        if (columns.has("last_login")) {
            await query("UPDATE users SET last_login = NOW() WHERE id = $1", [userId]);
        }
    } catch (error) {
        // Fail-safe
    }
}

function signAuthToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            full_name: user.full_name
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

async function sendPasswordResetEmail(user, otp) {
    const host = process.env.SMTP_HOST;
    if (!host) return false;

    const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });

    const appName = "MedIntel AI";
    const resetUrl = process.env.FRONTEND_RESET_URL || "reset-password.html";

    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@medintel.local",
        to: user.email,
        subject: `${appName} password reset code`,
        text: `Your ${appName} password reset OTP is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email. Reset page: ${resetUrl}`,
        html: `
            <p>Hello ${String(user.full_name || "there").replace(/[<>]/g, "")},</p>
            <p>Your MedIntel AI password reset OTP is:</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p>
            <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
            <p><a href="${resetUrl}">Open reset page</a></p>
        `
    });
    return true;
}

// =====================================================
// REGISTER USER
// =====================================================
exports.registerUser = async (req, res) => {
    try {
        const { full_name, email, password, age, gender } = req.body;

        const cleanName = toNullableString(full_name, 120);
        const normalizedEmail = normalizeEmail(email);
        const passwordError = validatePassword(password);
        const cleanAge = sanitizeAge(age);

        if (!cleanName || !normalizedEmail || !password) {
            return res.status(400).json({ success: false, message: "Full name, email and password are required" });
        }

        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address" });
        }

        if (passwordError) {
            return res.status(400).json({ success: false, message: passwordError });
        }

        if (cleanAge === undefined) {
            return res.status(400).json({ success: false, message: "Age must be between 0 and 130" });
        }

        // Check if unique user exists using Postgres format
        const user = await findUserByEmail(normalizedEmail);
        if (user) {
            return res.status(400).json({ success: false, message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // 🟢 Changed placeholders to $1, $2, etc., and attached RETURNING id
        const sql = `
            INSERT INTO users (full_name, email, password, age, gender, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id
        `;

        const result = await query(sql, [
            cleanName,
            normalizedEmail,
            hashedPassword,
            cleanAge,
            sanitizeGender(gender)
        ]);

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            userId: result[0].id // 🟢 Reads directly from Postgres array mapping
        });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ success: false, message: "Registration failed" });
    }
};

// =====================================================
// LOGIN USER
// =====================================================
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }

        const user = await findUserByEmail(normalizedEmail);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (isInactiveUser(user)) {
            return res.status(403).json({ success: false, message: "This account is deactivated" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }

        await updateLastLoginIfAvailable(user.id);

        const refreshedUser = await findUserById(user.id);
        const token = signAuthToken(refreshedUser || user);

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: buildSafeUserProfile(refreshedUser || user)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// =====================================================
// CURRENT USER PROFILE
// =====================================================
exports.getCurrentUserProfile = async (req, res) => {
    try {
        const user = await findUserById(req.user.id);

        if (!user || isInactiveUser(user)) {
            return res.status(404).json({ success: false, message: "User profile not found" });
        }

        return res.status(200).json({ success: true, user: buildSafeUserProfile(user) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to load profile" });
    }
};

// =====================================================
// UPDATE CURRENT USER PROFILE
// =====================================================
exports.updateCurrentUserProfile = async (req, res) => {
    try {
        const columns = await getUserColumns();
        const fields = {};

        if (Object.prototype.hasOwnProperty.call(req.body, "full_name")) {
            const name = toNullableString(req.body.full_name, 120);
            if (!name) return res.status(400).json({ success: false, message: "Full name is required" });
            fields.full_name = name;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "age")) {
            const age = sanitizeAge(req.body.age);
            if (age === undefined) return res.status(400).json({ success: false, message: "Age must be between 0 and 130" });
            fields.age = age;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "gender")) {
            fields.gender = sanitizeGender(req.body.gender);
        }

        const optionalFields = {
            theme_preference: () => sanitizeThemePreference(req.body.theme_preference),
            notifications_enabled: () => (parseBoolean(req.body.notifications_enabled, true) ? 1 : 0),
            medical_reminders_enabled: () => (parseBoolean(req.body.medical_reminders_enabled, false) ? 1 : 0),
            chronic_conditions: () => toNullableString(req.body.chronic_conditions, 1000),
            allergies: () => toNullableString(req.body.allergies, 1000),
            emergency_contact: () => toNullableString(req.body.emergency_contact, 255),
            medical_history: () => toNullableString(req.body.medical_history, 2000),
            profile_image: () => toNullableString(req.body.profile_image, 500)
        };

        Object.entries(optionalFields).forEach(([field, getValue]) => {
            if (columns.has(field) && Object.prototype.hasOwnProperty.call(req.body, field)) {
                fields[field] = getValue();
            }
        });

        if (!Object.keys(fields).length) {
            const user = await findUserById(req.user.id);
            return res.status(200).json({
                success: true,
                message: "No supported profile fields were changed",
                user: buildSafeUserProfile(user)
            });
        }

        // 🟢 Converts fields dynamic syntax to Postgres ($1, $2)
        const assignments = Object.keys(fields).map((field, idx) => `${field} = $${idx + 1}`);
        const params = Object.values(fields);

        if (columns.has("updated_at")) {
            assignments.push("updated_at = NOW()");
        }

        params.push(req.user.id);
        // Appends the target ID parameter dynamically
        await query(`UPDATE users SET ${assignments.join(", ")} WHERE id = $${params.length}`, params);

        const updatedUser = await findUserById(req.user.id);

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: buildSafeUserProfile(updatedUser)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to update profile" });
    }
};

// =====================================================
// CHANGE PASSWORD
// =====================================================
exports.changePassword = async (req, res) => {
    try {
        const currentPassword = String(req.body.current_password || "");
        const newPassword = String(req.body.new_password || "");
        const passwordError = validatePassword(newPassword);

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Current password and new password are required" });
        }

        if (passwordError) {
            return res.status(400).json({ success: false, message: passwordError });
        }

        const user = await findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const currentPasswordMatches = await bcrypt.compare(currentPassword, user.password);
        if (!currentPasswordMatches) {
            return res.status(401).json({ success: false, message: "Current password is incorrect" });
        }

        const sameAsOld = await bcrypt.compare(newPassword, user.password);
        if (sameAsOld) {
            return res.status(400).json({ success: false, message: "Choose a new password that is different from current password" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const columns = await getUserColumns();
        const updatedAtSql = columns.has("updated_at") ? ", updated_at = NOW()" : "";

        // 🟢 Swapped placeholders to Postgres standard ($1, $2)
        await query(`UPDATE users SET password = $1 ${updatedAtSql} WHERE id = $2`, [hashedPassword, req.user.id]);

        return res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to change password" });
    }
};

// =====================================================
// REQUEST PASSWORD RESET OTP
// =====================================================
exports.requestPasswordReset = async (req, res) => {
    const genericMessage = "If this email exists, a password reset OTP has been sent.";
    try {
        const email = normalizeEmail(req.body.email);
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "A valid email address is required" });
        }

        await ensurePasswordResetTable();
        const user = await findUserByEmail(email);

        if (!user || isInactiveUser(user)) {
            return res.status(200).json({ success: true, message: genericMessage });
        }

        const otp = String(crypto.randomInt(100000, 1000000));
        const otpHash = await bcrypt.hash(otp, 10);
        
        // 🟢 Postgres processes Date values objects cleanly without custom formatting strings
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // 🟢 Swapped parameters to Postgres ($1, $2)
        await query("UPDATE password_reset_otps SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
        await query("INSERT INTO password_reset_otps (user_id, email, otp_hash, expires_at) VALUES ($1, $2, $3, $4)", [
            user.id, user.email, otpHash, expiresAt
        ]);

        let emailSent = false;
        try {
            emailSent = await sendPasswordResetEmail(user, otp);
        } catch (error) {
            emailSent = false;
        }

        const response = { success: true, message: genericMessage, email_sent: emailSent };

        if (!emailSent && process.env.NODE_ENV !== "production") {
            response.dev_otp = otp;
            response.message = `${genericMessage} Local development OTP is available below.`;
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to start password reset" });
    }
};

// =====================================================
// RESET PASSWORD WITH OTP
// =====================================================
exports.resetPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const otp = String(req.body.otp || "").trim();
        const newPassword = String(req.body.new_password || "");
        const passwordError = validatePassword(newPassword);

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "A valid email address is required" });
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
        }

        if (passwordError) {
            return res.status(400).json({ success: false, message: passwordError });
        }

        await ensurePasswordResetTable();
        const user = await findUserByEmail(email);

        if (!user || isInactiveUser(user)) {
            return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
        }

        // 🟢 Changed placeholders to Postgres ($1, $2)
        const resetRows = await query(`
            SELECT * FROM password_reset_otps
            WHERE user_id = $1 AND email = $2 AND used_at IS NULL AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 5
        `, [user.id, user.email]);

        let matchedReset = null;
        for (const reset of resetRows) {
            const matches = await bcrypt.compare(otp, reset.otp_hash);
            if (matches) {
                matchedReset = reset;
                break;
            }
        }

        if (!matchedReset) {
            return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
        }

        const sameAsOld = await bcrypt.compare(newPassword, user.password);
        if (sameAsOld) {
            return res.status(400).json({ success: false, message: "Choose a password that is different from current password" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const columns = await getUserColumns();
        const updatedAtSql = columns.has("updated_at") ? ", updated_at = NOW()" : "";

        // 🟢 Swapped query placeholders
        await query(`UPDATE users SET password = $1 ${updatedAtSql} WHERE id = $2`, [hashedPassword, user.id]);
        await query("UPDATE password_reset_otps SET used_at = NOW() WHERE id = $1", [matchedReset.id]);

        return res.status(200).json({ success: true, message: "Password reset successfully. Please log in with your new password." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to reset password" });
    }
};

// =====================================================
// LOGOUT
// =====================================================
exports.logoutUser = (req, res) => {
    return res.status(200).json({ success: true, message: "Logged out successfully" });
};

// =====================================================
// DEACTIVATE ACCOUNT
// =====================================================
exports.deactivateCurrentUser = async (req, res) => {
    try {
        const columns = await getUserColumns();
        const assignments = [];
        const params = [];
        let canDeactivate = false;

        if (columns.has("is_active")) {
            assignments.push(`is_active = $${params.length + 1}`);
            params.push(0);
            canDeactivate = true;
        }

        if (columns.has("account_status")) {
            assignments.push(`account_status = $${params.length + 1}`);
            params.push("deactivated");
            canDeactivate = true;
        }

        if (columns.has("updated_at")) {
            assignments.push("updated_at = NOW()");
        }

        if (!canDeactivate) {
            return res.status(501).json({ success: false, message: "Account deactivation requires the is_active or account_status column" });
        }

        params.push(req.user.id);
        // 🟢 Safe target matching parameter tracking
        await query(`UPDATE users SET ${assignments.join(", ")} WHERE id = $${params.length}`, params);

        return res.status(200).json({ success: true, message: "Account deactivated successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to deactivate account" });
    }
};