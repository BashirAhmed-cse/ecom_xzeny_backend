import express from 'express';
import { getLanguages } from '../controllers/languageController.js';

const router = express.Router();

// GET /api/languages
router.get('/', getLanguages);

export default router;
