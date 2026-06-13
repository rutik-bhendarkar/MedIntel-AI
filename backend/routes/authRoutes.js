const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerUser,
  loginUser,
  getCurrentUser,
  updateCurrentUser,
  changePassword,
  deactivateCurrentUser,
  logoutUser,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", authMiddleware, getCurrentUser);
router.put("/me", authMiddleware, updateCurrentUser);
router.post("/password/change", authMiddleware, changePassword);
router.put("/me/deactivate", authMiddleware, deactivateCurrentUser);
router.post("/logout", authMiddleware, logoutUser);

module.exports = router;
