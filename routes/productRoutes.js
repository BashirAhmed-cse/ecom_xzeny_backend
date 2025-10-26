import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { authenticate, authorizeAdmin } from "../middleware/authMiddleware.js";
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  frontendProductData,
  frontendProductDetails,
  frontendMultiProductDetails
} from "../controllers/productController.js";

const router = express.Router();

// ====================
// 📁 Upload Directory Setup
// ====================
const uploadDir = path.join(process.cwd(), "Uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });

}

// ====================
// ⚙️ Multer Configuration
// ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  },
});

const fileFilter = (req, file, cb) => {

  if (!file || !file.originalname) {
    return cb(
      new Error(
        `Invalid file: originalname is missing. Received: ${JSON.stringify(
          file
        )}`
      )
    );
  }

  const fileTypes = /jpeg|jpg|png|gif|webp/; // Added webp support
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  // ✅ UPDATED: Accept the field names that frontend is actually sending
  const validField =
    file.fieldname === "productImages" ||
    file.fieldname.startsWith("colorImages[") ||
    file.fieldname.startsWith("images[") || // Frontend is sending images[0], images[1], etc.
    file.fieldname.startsWith("color_variant_images["); // Frontend might send color_variant_images[index]

  if (extname && mimetype && validField) {
    cb(null, true);
  } else {
    const errorMsg = `Invalid file field: ${
      file.fieldname
    }. Expected: productImages, colorImages[hexValue], images[index], or color_variant_images[index]. Received: ${JSON.stringify(
      file
    )}`;
    cb(new Error(errorMsg));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

// ====================
// 🛒 Routes
// ====================

router.get("/", getProducts);
router.get("/:id", getProduct);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

// POST: Create Product (with dynamic images)
router.post(
  "/",
  (req, res, next) => {
    console.log("📥 Incoming request (before auth):", {
      contentType: req.get("Content-Type"),
      headers: req.headers.authorization,
    });
    next();
  },
  authenticate,
  authorizeAdmin,
  (req, res, next) => {
  
    next();
  },

  // ✅ Use `.any()` to allow dynamic color fields
  upload.any(),

  (req, res, next) => {


    // ✅ UPDATED: Log all files for debugging
    if (req.files && req.files.length > 0) {

      req.files.forEach((file, index) => {

      });
    }

    // ✅ UPDATED: Accept the field names that frontend is actually sending
    const validFieldNames = [
      "productImages",
      "images", // Frontend might send just 'images'
      "colorImages",
      "color_variant_images",
    ];

    for (const file of req.files || []) {
      const isValidField =
        file.fieldname === "productImages" ||
        file.fieldname.startsWith("colorImages[") ||
        file.fieldname.startsWith("images[") ||
        file.fieldname.startsWith("color_variant_images[") ||
        file.fieldname === "images"; // Single image field

      if (!isValidField) {

        // Don't reject here, just log and continue
        // return res.status(400).json({ error: `Invalid field: ${file.fieldname}` });
      }
    }

    // ✅ UPDATED: Count all types of image fields
    const productImageCount = (req.files || []).filter(
      (f) =>
        f.fieldname === "productImages" ||
        f.fieldname.startsWith("images[") ||
        f.fieldname === "images"
    ).length;

    if (productImageCount > 10) {
      return res
        .status(400)
        .json({ error: "Too many product images (max 10)" });
    }

    next();
  },
  createProduct
);

// ====================
// 🖼️ Serve Uploaded Files
// ====================
router.use("/uploads", express.static(uploadDir));

//for frontend
router.get("/frontend/productData", frontendProductData);
router.get("/frontend/productDetails/:id", frontendProductDetails);
router.get("/frontend/productDetails/multi/:id", frontendMultiProductDetails);


export default router;
