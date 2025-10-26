import express from 'express';
import {
  createDiscountTier,
  getDiscountTiers,
  getDiscountTierById,
  updateDiscountTier,
  deleteDiscountTier,
  getActiveDiscountTiers,
  createFlashDiscount,
  getFlashDiscount,
  updateFlashDiscount,
  deleteFlashDiscount
} from '../controllers/discountTierController.js';

const router = express.Router();

router.post("/", createDiscountTier);
router.get("/", getDiscountTiers);
router.get("/active", getActiveDiscountTiers);
router.get("/:id", getDiscountTierById);
router.put("/:id", updateDiscountTier);
router.delete("/:id", deleteDiscountTier);


router.post("/flash-discounts", createFlashDiscount);
router.get("/flash-discounts/:id", getFlashDiscount);
router.put("/flash-discounts/:id", updateFlashDiscount);
router.delete("/flash-discounts/:id", deleteFlashDiscount);
export default router;