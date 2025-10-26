import express from "express";
import {
  getColors,
  createColor,
  updateColor,
  deleteColor,
  getSizes,
  createSize,
  updateSize,
  deleteSize,
createPage,
getPage,
getAllPages,
deletePage,
togglePageStatus,
createGlobalSeo,
getGlobalSeo,
createTopHeader,
getTopHeader,
getActiveTopHeaders,
updateTopHeader,
deleteTopHeader,
uploadLogo,
getlogo,
updateLogo,
deleteLogo,
setActiveLogo
} from "../controllers/settingController.js";

const router = express.Router();

// 🎨 Colors
router.get("/colors", getColors);
router.post("/colors", createColor);
router.put("/colors/:colorId", updateColor);
router.delete("/colors/:colorId", deleteColor);

// 📏 Sizes
router.get("/sizes", getSizes);
router.post("/sizes", createSize);
router.put("/sizes/:sizeId", updateSize);
router.delete("/sizes/:sizeId", deleteSize);


// routes/settings.js
router.post("/page/:slug", createPage);
router.get("/page/:slug", getPage);
router.get("/pages", getAllPages);
router.delete("/page/:id", deletePage);
router.put("/page/:id/status", togglePageStatus);

//global seo

router.post("/global_seo", createGlobalSeo);
router.get("/global_seo", getGlobalSeo);

//top header

router.post("/top_header", createTopHeader);
router.get("/top_header", getTopHeader);
router.get("/top_header/active", getActiveTopHeaders); // Public endpoint
router.put("/top_header/:id", updateTopHeader);
router.delete("/top_header/:id", deleteTopHeader);

//logo and website title

router.get('/website-logo', getlogo);
router.post('/website-logo', uploadLogo);
router.put('/website-logo/:id', updateLogo);
router.delete('/website-logo/:id', deleteLogo);
router.put('/website-logo/:id/set-active', setActiveLogo);


export default router;