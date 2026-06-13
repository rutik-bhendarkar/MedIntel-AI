const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

const ensureUsersTablePromise = query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    age INTEGER,
    gender VARCHAR(20),
    is_verified SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(results);
    });
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUser(user) {
  const { password, ...publicUser } = user;
  return publicUser;
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      full_name: user.full_name
    },
    process.env.JWT_SECRET || "medintel_local_dev_secret",
    {
      expiresIn: JWT_EXPIRES_IN
    }
  );
}

exports.registerUser = async (req, res) => {
  try {
    await ensureUsersTablePromise;

    const { full_name, fullName, email, password, age, gender } = req.body;
    const name = String(full_name || fullName || "").trim();
    const normalizedEmail = normalizeEmail(email);
    const normalizedGender = String(gender || "").trim() || null;
    const normalizedAge = age ? Number(age) : null;

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (normalizedAge !== null && (!Number.isInteger(normalizedAge) || normalizedAge < 1 || normalizedAge > 120)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid age",
      });
    }

    const existingUsers = await query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);

    const result = await query(
      `
        INSERT INTO users (full_name, email, password, age, gender, is_verified)
        VALUES (?, ?, ?, ?, ?, 1)
      `,
      [name, normalizedEmail, passwordHash, normalizedAge, normalizedGender]
    );

    const user = {
      id: result.insertId,
      full_name: name,
      email: normalizedEmail,
      age: normalizedAge,
      gender: normalizedGender,
      is_verified: 1,
    };

    const token = createToken(user);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Register error:", err);

    if (err.code === "ER_DUP_ENTRY" || err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

exports.loginUser = async (req, res) => {
  try {
    await ensureUsersTablePromise;

    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const users = await query(
      `
        SELECT *
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];
    let passwordMatches = await bcrypt.compare(String(password), user.password);

    if (!passwordMatches && user.password === String(password)) {
      passwordMatches = true;
      const upgradedHash = await bcrypt.hash(String(password), SALT_ROUNDS);
      await query("UPDATE users SET password = ? WHERE id = ?", [upgradedHash, user.id]);
    }

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

async function getUserColumns() {
  await ensureUsersTablePromise;
  const columns = await query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = current_schema()"
  );
  return new Set(columns.map((column) => column.column_name));
}

async function getUserById(userId) {
  await ensureUsersTablePromise;

  const users = await query(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [userId]
  );

  return users[0] || null;
}

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Get current user error:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load user profile",
    });
  }
};

exports.updateCurrentUser = async (req, res) => {
  try {
    const columns = await getUserColumns();
    const allowedFields = [
      "full_name",
      "username",
      "age",
      "gender",
      "theme_preference",
      "notifications_enabled",
      "medical_reminders_enabled",
      "chronic_conditions",
      "allergies",
      "emergency_contact",
      "medical_history",
      "profile_image",
    ];

    const updates = [];
    const values = [];

    allowedFields.forEach((field) => {
      if (!columns.has(field) || req.body[field] === undefined) {
        return;
      }

      let value = req.body[field];

      if (field === "full_name") {
        value = String(value || "").trim();
        if (!value) return;
      }

      if (field === "age") {
        value = value === "" || value === null ? null : Number(value);
        if (value !== null && (!Number.isInteger(value) || value < 1 || value > 120)) {
          return;
        }
      }

      if (["notifications_enabled", "medical_reminders_enabled"].includes(field)) {
        value = value ? 1 : 0;
      }

      updates.push(`${field} = ?`);
      values.push(value);
    });

    if (!updates.length) {
      const user = await getUserById(req.user.id);

      return res.status(200).json({
        success: true,
        message: "No profile changes to save",
        user: sanitizeUser(user),
      });
    }

    if (columns.has("updated_at")) {
      updates.push("updated_at = NOW()");
    }

    values.push(req.user.id);

    await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    const updatedUser = await getUserById(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: sanitizeUser(updatedUser),
    });
  } catch (err) {
    console.error("Update profile error:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    if (String(new_password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const passwordMatches =
      (await bcrypt.compare(String(current_password), user.password)) ||
      user.password === String(current_password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const passwordHash = await bcrypt.hash(String(new_password), SALT_ROUNDS);
    await query("UPDATE users SET password = ? WHERE id = ?", [passwordHash, req.user.id]);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to change password",
    });
  }
};

exports.deactivateCurrentUser = async (req, res) => {
  try {
    const columns = await getUserColumns();
    const updates = [];

    if (columns.has("is_active")) {
      updates.push("is_active = 0");
    }

    if (columns.has("account_status")) {
      updates.push("account_status = 'deactivated'");
    }

    if (columns.has("updated_at")) {
      updates.push("updated_at = NOW()");
    }

    if (updates.length) {
      await query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, [req.user.id]);
    }

    return res.status(200).json({
      success: true,
      message: "Account deactivated",
    });
  } catch (err) {
    console.error("Deactivate user error:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to deactivate account",
    });
  }
};

exports.logoutUser = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};
