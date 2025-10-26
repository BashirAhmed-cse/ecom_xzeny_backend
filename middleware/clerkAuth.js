// middleware/clerkAuth.js
import { createClerkClient, verifyToken } from '@clerk/backend';

// Initialize Clerk client
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export const verifyClerkAuth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header with Bearer token required',
      });
    }

    const token = authHeader.replace('Bearer ', '');


    // ✅ Correct way to verify a JWT using Clerk v5
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }

    // Fetch the user data using the Clerk client
    const user = await clerkClient.users.getUser(payload.sub);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found in Clerk',
      });
    }

    // Attach user info to request for use in routes
    req.clerkUser = {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    };


    next();
  } catch (error) {
    console.error('❌ Clerk auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message,
    });
  }
};

// ✅ Optional role-based middleware
export const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      if (!req.clerkUser) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Get the latest user data for role validation
      const user = await clerkClient.users.getUser(req.clerkUser.id);
      const userRole = user.publicMetadata?.role || 'user';

      if (!roles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
      }

      req.clerkUser.role = userRole;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user role',
      });
    }
  };
};

export const requireAdmin = requireRole(['admin']);
