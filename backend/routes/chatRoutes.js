const express = require("express");
const router = express.Router();
const { askChatbot } = require("../controllers/chatController");

router.post("/ask", askChatbot);

module.exports = router;