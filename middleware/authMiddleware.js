import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const tokenFromCookie = req.cookies.auth_token; // Changed from req.cookies.token


  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : tokenFromCookie;
  if (!token) {

    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; // Expecting { userId, email, role }
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};
// admin only middleware
export const authorizeAdmin = (req, res, next) => {

  if (!req.user || req.user.role !== 'admin') {

    return res.status(403).json({ message: 'Forbidden: Admins only' });
  }
  next();
};