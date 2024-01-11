const express = require("express");
const profileController = require("../controllers/profile.controller");

const router = express.Router();
router.get("/", profileController.getProfile);
router.get("/changepassword", profileController.getChangePasswordP);

router.post("/update", profileController.updateProfile);

module.exports = router;
