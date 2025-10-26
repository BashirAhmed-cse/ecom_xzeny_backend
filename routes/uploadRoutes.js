// routes/uploadRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// ====================
// 📁 Upload Directory Setup
// ====================
const uploadDir = path.join(process.cwd(), "Uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });

}

// ====================
// ⚙️ Multer Configuration for Tiptap
// ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `tiptap-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  },
});

const fileFilter = (req, file, cb) => {


  if (!file || !file.originalname) {
    return cb(new Error("Invalid file"));
  }

  const fileTypes = /jpeg|jpg|png|gif|webp/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  // ✅ Accept both 'image' and 'file' field names for Tiptap
  const validField = file.fieldname === "image" || file.fieldname === "file";

  if (extname && mimetype && validField) {
    cb(null, true);
  } else {
    const errorMsg = `Invalid file type or field. Field: ${file.fieldname}, Type: ${file.mimetype}`;
    cb(new Error(errorMsg));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

// ====================
// 🖼️ Tiptap Image Upload Endpoint
// ====================
router.post("/tiptap-upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    // Construct the public URL - Use your server's port and correct path
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3009}`;
    const imageUrl = `${baseUrl}/Uploads/${req.file.filename}`;



    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      message: "Image uploaded successfully"
    });

  } catch (error) {
    console.error("❌ Tiptap upload error:", error);
    res.status(500).json({
      success: false,
      error: "Upload failed",
      details: error.message
    });
  }
});

// ====================
// 📤 Multiple File Upload Endpoint (for products, etc.)
// ====================
const productUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|webp/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    const validField = 
      file.fieldname === "productImages" ||
      file.fieldname.startsWith("colorImages[") ||
      file.fieldname.startsWith("images[") ||
      file.fieldname.startsWith("color_variant_images[");

    if (extname && mimetype && validField) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file field: ${file.fieldname}`));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/product-upload", productUpload.array("images", 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded"
      });
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3009}`;
    const uploadedFiles = req.files.map(file => ({
      url: `${baseUrl}/Uploads/${file.filename}`,
      filename: file.filename,
      originalname: file.originalname,
      fieldname: file.fieldname
    }));



    res.json({
      success: true,
      files: uploadedFiles,
      message: "Files uploaded successfully"
    });

  } catch (error) {
    console.error("❌ Product upload error:", error);
    res.status(500).json({
      success: false,
      error: "Upload failed"
    });
  }
});


// 🖼️ Tiptap Image Upload Endpoint
// ====================
router.post("/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    // Construct the public URL - Use your server's port and correct path
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3009}`;
    const imageUrl = `${baseUrl}/Uploads/${req.file.filename}`;



    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      message: "Image uploaded successfully"
    });

  } catch (error) {
    console.error("❌ Tiptap upload error:", error);
    res.status(500).json({
      success: false,
      error: "Upload failed",
      details: error.message
    });
  }
});

export default router;
