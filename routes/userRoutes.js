import express from 'express';
import { signup, login, getUsers,logout,verify } from '../controllers/userController.js';
import { authenticate, authorizeAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify', verify);

// Admin-only route
router.get('/', authenticate, authorizeAdmin, getUsers);

export default router;
