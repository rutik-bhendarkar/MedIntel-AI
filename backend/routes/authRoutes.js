const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    registerUser,
    loginUser,
    getCurrentUserProfile,
    updateCurrentUserProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    logoutUser,
    deactivateCurrentUser
} = require("../controllers/authController");

// POST /api/auth/register
router.post("/register", registerUser);

// POST /api/auth/login
router.post("/login", loginUser);

// GET /api/auth/me
router.get("/me", authMiddleware, getCurrentUserProfile);

// PUT /api/auth/me
router.put("/me", authMiddleware, updateCurrentUserProfile);

// PUT /api/auth/me/deactivate
router.put("/me/deactivate", authMiddleware, deactivateCurrentUser);

// POST /api/auth/password/change
router.post("/password/change", authMiddleware, changePassword);

// POST /api/auth/password/forgot
router.post("/password/forgot", requestPasswordReset);

// POST /api/auth/password/reset
router.post("/password/reset", resetPassword);

// POST /api/auth/logout
router.post("/logout", authMiddleware, logoutUser);

module.exports = router;
