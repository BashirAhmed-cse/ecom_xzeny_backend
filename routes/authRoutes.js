// routes/authRoutes.js
import express from "express";
import { verifyClerkAuth } from "../middleware/clerkAuth.js";
import db from "../database.js";

const router = express.Router();

// --------------------
// 🔹 Helper Functions
// --------------------
const getUserByClerkId = async (clerkId) => {
  const [users] = await db.query(
    'SELECT user_id, email, first_name, last_name, role, clerk_id, phone FROM users WHERE clerk_id = ?',
    [clerkId]
  );
  return users[0] || null;
};

const getUserByEmail = async (email) => {
  const [users] = await db.query(
    'SELECT user_id, email, first_name, last_name, role, clerk_id, phone FROM users WHERE email = ?',
    [email]
  );
  return users[0] || null;
};

const getUserById = async (userId) => {
  const [users] = await db.query(
    'SELECT user_id, email, first_name, last_name, role, clerk_id, phone FROM users WHERE user_id = ?',
    [userId]
  );
  return users[0] || null;
};

// --------------------
// 🔄 Sync Clerk user with database
// --------------------
router.post('/sync-user', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;

    if (!clerkUser.email) {
      return res.status(400).json({ success: false, message: "User email is required" });
    }

    // Check if user exists by clerk_id or email
    const existingUser = await getUserByClerkId(clerkUser.id) || await getUserByEmail(clerkUser.email);

    let user;
    if (existingUser) {
      // Update existing user
      await db.query(
        'UPDATE users SET clerk_id = ?, first_name = ?, last_name = ?, updated_at = NOW() WHERE user_id = ?',
        [clerkUser.id, clerkUser.firstName, clerkUser.lastName, existingUser.user_id]
      );
      user = await getUserByEmail(clerkUser.email);
 
    } else {
      // Insert new user
      const [result] = await db.query(
        `INSERT INTO users (clerk_id, email, first_name, last_name, role, created_at)
         VALUES (?, ?, ?, ?, 'user', NOW())`,
        [clerkUser.id, clerkUser.email, clerkUser.firstName, clerkUser.lastName]
      );
      user = await getUserByClerkId(clerkUser.id);

    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Sync user error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------
// 📋 Get user profile
// --------------------
router.get('/profile', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const user = await getUserByClerkId(clerkUser.id);

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✏️ Update user profile
// --------------------
router.put('/profile', verifyClerkAuth, async (req, res) => {
  let connection;
  try {
    const { clerkUser } = req;
    const { first_name, last_name, phone } = req.body;
    


    // Validation
    if (!first_name?.trim() || !last_name?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'First name and last name are required' 
      });
    }

    // Get database connection
    connection = await db.getConnection();

    // 1. Update your MySQL database
    const [result] = await connection.execute(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ?, updated_at = NOW() WHERE clerk_id = ?',
      [first_name.trim(), last_name.trim(), phone?.trim() || null, clerkUser.id]
    );

    // 2. Update Clerk user via REST API
    try {
      const response = await fetch(`https://api.clerk.com/v1/users/${clerkUser.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: first_name.trim(),
          last_name: last_name.trim(),
        }),
      });

      if (response.ok) {

      } else {
   
      }
    } catch (clerkError) {

    }

    // Get updated user from your database
    const [updatedUsers] = await connection.execute(
      'SELECT user_id, clerk_id, role, first_name, last_name, email, phone, created_at FROM users WHERE clerk_id = ?',
      [clerkUser.id]
    );

    const updatedUser = updatedUsers[0];

    res.json({ 
      success: true, 
      message: "Profile updated successfully", 
      data: updatedUser
    });
    
  } catch (err) {
    console.error('❌ Update profile error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: err.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// --------------------
// 🏠 ADDRESS ROUTES
// --------------------

// 📋 Get all addresses for current user
router.get('/addresses', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;

    // First get the user to get user_id
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get all addresses for this user
    const [addresses] = await db.query(
      `SELECT address_id, user_id, street, city, state, country, postal_code, is_billing, is_shipping, created_at
       FROM addresses WHERE user_id = ? ORDER BY created_at DESC`,
      [user.user_id]
    );

    res.json({ 
      success: true, 
      data: addresses 
    });
  } catch (err) {
    console.error('❌ Get addresses error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch addresses',
      error: err.message 
    });
  }
});

// 📍 Get specific address by ID
router.get('/addresses/:id', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { id } = req.params;

    // First get the user to verify ownership
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get the address and verify it belongs to the user
    const [addresses] = await db.query(
      `SELECT address_id, user_id, street, city, state, country, postal_code, is_billing, is_shipping, created_at
       FROM addresses WHERE address_id = ? AND user_id = ?`,
      [id, user.user_id]
    );

    if (addresses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found or access denied" 
      });
    }

    res.json({ 
      success: true, 
      data: addresses[0] 
    });
  } catch (err) {
    console.error('❌ Get address error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch address',
      error: err.message 
    });
  }
});

// ➕ Create new address
router.post('/addresses', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { street, city, state, country, postal_code, is_billing = false, is_shipping = false } = req.body;

    // Validation
    if (!street?.trim() || !city?.trim() || !state?.trim() || !country?.trim() || !postal_code?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'All address fields are required' 
      });
    }

    // First get the user to get user_id
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Insert new address
    const [result] = await db.query(
      `INSERT INTO addresses (user_id, street, city, state, country, postal_code, is_billing, is_shipping, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [user.user_id, street.trim(), city.trim(), state.trim(), country.trim(), postal_code.trim(), is_billing, is_shipping]
    );

    // Get the newly created address
    const [addresses] = await db.query(
      `SELECT address_id, user_id, street, city, state, country, postal_code, is_billing, is_shipping, created_at
       FROM addresses WHERE address_id = ?`,
      [result.insertId]
    );



    res.status(201).json({ 
      success: true, 
      message: "Address created successfully",
      data: addresses[0] 
    });
  } catch (err) {
    console.error('❌ Create address error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create address',
      error: err.message 
    });
  }
});

// ✏️ Update address
router.put('/addresses/:id', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { id } = req.params;
    const { street, city, state, country, postal_code, is_billing, is_shipping } = req.body;

    // First get the user to verify ownership
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if address exists and belongs to user
    const [existingAddresses] = await db.query(
      'SELECT * FROM addresses WHERE address_id = ? AND user_id = ?',
      [id, user.user_id]
    );

    if (existingAddresses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found or access denied" 
      });
    }

    // Update address
    await db.query(
      `UPDATE addresses 
       SET street = ?, city = ?, state = ?, country = ?, postal_code = ?, is_billing = ?, is_shipping = ?, updated_at = NOW()
       WHERE address_id = ? AND user_id = ?`,
      [
        street?.trim() || existingAddresses[0].street,
        city?.trim() || existingAddresses[0].city,
        state?.trim() || existingAddresses[0].state,
        country?.trim() || existingAddresses[0].country,
        postal_code?.trim() || existingAddresses[0].postal_code,
        is_billing !== undefined ? is_billing : existingAddresses[0].is_billing,
        is_shipping !== undefined ? is_shipping : existingAddresses[0].is_shipping,
        id,
        user.user_id
      ]
    );

    // Get updated address
    const [updatedAddresses] = await db.query(
      `SELECT address_id, user_id, street, city, state, country, postal_code, is_billing, is_shipping, created_at
       FROM addresses WHERE address_id = ?`,
      [id]
    );



    res.json({ 
      success: true, 
      message: "Address updated successfully",
      data: updatedAddresses[0] 
    });
  } catch (err) {
    console.error('❌ Update address error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update address',
      error: err.message 
    });
  }
});

// 🗑️ Delete address
router.delete('/addresses/:id', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { id } = req.params;

    // First get the user to verify ownership
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if address exists and belongs to user
    const [existingAddresses] = await db.query(
      'SELECT * FROM addresses WHERE address_id = ? AND user_id = ?',
      [id, user.user_id]
    );

    if (existingAddresses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found or access denied" 
      });
    }

    // Delete address
    await db.query(
      'DELETE FROM addresses WHERE address_id = ? AND user_id = ?',
      [id, user.user_id]
    );


    res.json({ 
      success: true, 
      message: "Address deleted successfully" 
    });
  } catch (err) {
    console.error('❌ Delete address error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete address',
      error: err.message 
    });
  }
});

// ⭐ Set default address (billing/shipping)
router.patch('/addresses/:id/default', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { id } = req.params;
    const { type = 'shipping' } = req.body; // 'billing' or 'shipping'

    if (!['billing', 'shipping'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: "Type must be 'billing' or 'shipping'" 
      });
    }

    // First get the user to verify ownership
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if address exists and belongs to user
    const [existingAddresses] = await db.query(
      'SELECT * FROM addresses WHERE address_id = ? AND user_id = ?',
      [id, user.user_id]
    );

    if (existingAddresses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found or access denied" 
      });
    }

    // First, reset all addresses of this type to false
    await db.query(
      `UPDATE addresses SET ${type === 'billing' ? 'is_billing' : 'is_shipping'} = false 
       WHERE user_id = ?`,
      [user.user_id]
    );

    // Then set the selected address as default
    await db.query(
      `UPDATE addresses SET ${type === 'billing' ? 'is_billing' : 'is_shipping'} = true 
       WHERE address_id = ? AND user_id = ?`,
      [id, user.user_id]
    );



    res.json({ 
      success: true, 
      message: `Default ${type} address set successfully` 
    });
  } catch (err) {
    console.error('❌ Set default address error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to set default address',
      error: err.message 
    });
  }
});



// --------------------
// 👤 Get current user
// --------------------
router.get('/me', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const user = await getUserByClerkId(clerkUser.id);

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Get user error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------
// 🩺 Health check
// --------------------
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working!',
  });
});

export default router;