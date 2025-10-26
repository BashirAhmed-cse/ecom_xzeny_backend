import express from "express";
import { verifyClerkAuth } from "../middleware/clerkAuth.js";
import { authenticate, authorizeAdmin } from "../middleware/authMiddleware.js";
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



// --------------------
// 📦 ORDER ROUTES
// --------------------

// 📋 Get all orders for current user
router.get('/', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    
    // Get user to get user_id
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get orders with address and item details
    const [orders] = await db.query(`
      SELECT 
        o.order_id,
        o.user_id,
        o.total_amount,
        o.currency_id,
        o.language_id,
        o.status,
        o.tracking_number,
        o.created_at,
        o.updated_at,
        sa.street as shipping_street,
        sa.city as shipping_city,
        sa.state as shipping_state,
        sa.country as shipping_country,
        sa.postal_code as shipping_postal_code,
        ba.street as billing_street,
        ba.city as billing_city,
        ba.state as billing_state,
        ba.country as billing_country,
        ba.postal_code as billing_postal_code
      FROM orders o
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.address_id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.address_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `, [user.user_id]);

    // Get order items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await db.query(`
          SELECT 
            oi.order_item_id,
            oi.order_id,
            oi.variant_id,
            oi.quantity,
            oi.unit_price,
            p.name as product_name,
            p.image_url,
            v.size,
            v.color
          FROM order_items oi
          LEFT JOIN variants v ON oi.variant_id = v.variant_id
          LEFT JOIN products p ON v.product_id = p.product_id
          WHERE oi.order_id = ?
        `, [order.order_id]);

        return {
          ...order,
          items: items || []
        };
      })
    );

    res.json({ 
      success: true, 
      data: ordersWithItems 
    });
  } catch (err) {
    console.error('❌ Get orders error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
      error: err.message 
    });
  }
});

// 📍 Get specific order by ID
router.get('/:id', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { id } = req.params;

    // Get user to verify ownership
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get order details
    const [orders] = await db.query(`
      SELECT 
        o.order_id,
        o.user_id,
        o.total_amount,
        o.currency_id,
        o.language_id,
        o.status,
        o.tracking_number,
        o.created_at,
        o.updated_at,
        sa.street as shipping_street,
        sa.city as shipping_city,
        sa.state as shipping_state,
        sa.country as shipping_country,
        sa.postal_code as shipping_postal_code,
        ba.street as billing_street,
        ba.city as billing_city,
        ba.state as billing_state,
        ba.country as billing_country,
        ba.postal_code as billing_postal_code
      FROM orders o
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.address_id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.address_id
      WHERE o.order_id = ? AND o.user_id = ?
    `, [id, user.user_id]);

    if (orders.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found or access denied" 
      });
    }

    const order = orders[0];

    // Get order items
    const [items] = await db.query(`
      SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.variant_id,
        oi.quantity,
        oi.unit_price,
        p.name as product_name,
        p.image_url,
        v.size,
        v.color
      FROM order_items oi
      LEFT JOIN variants v ON oi.variant_id = v.variant_id
      LEFT JOIN products p ON v.product_id = p.product_id
      WHERE oi.order_id = ?
    `, [id]);

    order.items = items || [];

    res.json({ 
      success: true, 
      data: order 
    });
  } catch (err) {
    console.error('❌ Get order error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch order',
      error: err.message 
    });
  }
});

// ➕ Create new order
router.post('/', verifyClerkAuth, async (req, res) => {
  let connection;
  try {
    const { clerkUser } = req;
    const { 
      items, 
      shipping_address, 
      billing_address, 
      payment_method = 'card',
      subtotal,
      shipping,
      tax,
      total 
    } = req.body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order must contain at least one item' 
      });
    }

    if (!shipping_address || !billing_address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Shipping and billing addresses are required' 
      });
    }

    // Get user
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Start transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Create or get shipping address
      let shippingAddressId;
      const [existingShippingAddress] = await connection.query(
        `SELECT address_id FROM addresses 
         WHERE user_id = ? AND street = ? AND city = ? AND state = ? AND country = ? AND postal_code = ?`,
        [user.user_id, shipping_address.street, shipping_address.city, shipping_address.state, shipping_address.country, shipping_address.postal_code]
      );

      if (existingShippingAddress.length > 0) {
        shippingAddressId = existingShippingAddress[0].address_id;
      } else {
        const [shippingResult] = await connection.query(
          `INSERT INTO addresses (user_id, street, city, state, country, postal_code, is_shipping, created_at)
           VALUES (?, ?, ?, ?, ?, ?, true, NOW())`,
          [user.user_id, shipping_address.street, shipping_address.city, shipping_address.state, shipping_address.country, shipping_address.postal_code]
        );
        shippingAddressId = shippingResult.insertId;
      }

      // 2. Create or get billing address
      let billingAddressId;
      const [existingBillingAddress] = await connection.query(
        `SELECT address_id FROM addresses 
         WHERE user_id = ? AND street = ? AND city = ? AND state = ? AND country = ? AND postal_code = ?`,
        [user.user_id, billing_address.street, billing_address.city, billing_address.state, billing_address.country, billing_address.postal_code]
      );

      if (existingBillingAddress.length > 0) {
        billingAddressId = existingBillingAddress[0].address_id;
      } else {
        const [billingResult] = await connection.query(
          `INSERT INTO addresses (user_id, street, city, state, country, postal_code, is_billing, created_at)
           VALUES (?, ?, ?, ?, ?, ?, true, NOW())`,
          [user.user_id, billing_address.street, billing_address.city, billing_address.state, billing_address.country, billing_address.postal_code]
        );
        billingAddressId = billingResult.insertId;
      }

      // 3. Generate professional tracking number (TRK + 6-8 digits)
      const generateProfessionalTrackingNumber = () => {
        const min = 100000; // 6 digits
        const max = 99999999; // 8 digits
        const randomDigits = Math.floor(Math.random() * (max - min + 1)) + min;
        return `TRK${randomDigits}`;
      };

      // Ensure tracking number is unique
      let trackingNumber;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        trackingNumber = generateProfessionalTrackingNumber();
        
        const [existingTracking] = await connection.query(
          'SELECT order_id FROM orders WHERE tracking_number = ?',
          [trackingNumber]
        );

        if (existingTracking.length === 0) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        // Fallback: Use timestamp-based tracking number
        const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        trackingNumber = `TRK${timestamp}${random}`;
        
        // Final check for uniqueness
        const [finalCheck] = await connection.query(
          'SELECT order_id FROM orders WHERE tracking_number = ?',
          [trackingNumber]
        );
        
        if (finalCheck.length > 0) {
          throw new Error('Failed to generate unique tracking number after multiple attempts');
        }
      }

      // 4. Create order
      const [orderResult] = await connection.query(
        `INSERT INTO orders (
          user_id, total_amount, currency_id, language_id, status, 
          shipping_address_id, billing_address_id, tracking_number, created_at, updated_at
        ) VALUES (?, ?, 1, 1, 'pending', ?, ?, ?, NOW(), NOW())`,
        [user.user_id, total, shippingAddressId, billingAddressId, trackingNumber]
      );

      const orderId = orderResult.insertId;

      // 5. Create order items and update stock
      for (const item of items) {
        // Insert order item
        await connection.query(
          `INSERT INTO order_items (order_id, variant_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`,
          [orderId, item.variant_id || item.product_id, item.quantity, item.unit_price || item.price]
        );

        // Update product stock - check if variant exists first
        if (item.variant_id || item.product_id) {
          const [variantCheck] = await connection.query(
            'SELECT variant_id FROM product_variants WHERE variant_id = ?',
            [item.variant_id || item.product_id]
          );
          
          if (variantCheck.length > 0) {
            await connection.query(
              'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE variant_id = ?',
              [item.quantity, item.variant_id || item.product_id]
            );
          } else {
            console.warn(`⚠️ Variant not found for stock update: ${item.variant_id || item.product_id}`);
          }
        }
      }

      // Commit transaction
      await connection.commit();

      // Get complete order details
      const [newOrders] = await connection.query(`
        SELECT 
          o.order_id,
          o.user_id,
          o.total_amount,
          o.currency_id,
          o.language_id,
          o.status,
          o.tracking_number,
          o.created_at,
          o.updated_at,
          sa.street as shipping_street,
          sa.city as shipping_city,
          sa.state as shipping_state,
          sa.country as shipping_country,
          sa.postal_code as shipping_postal_code,
          ba.street as billing_street,
          ba.city as billing_city,
          ba.state as billing_state,
          ba.country as billing_country,
          ba.postal_code as billing_postal_code
        FROM orders o
        LEFT JOIN addresses sa ON o.shipping_address_id = sa.address_id
        LEFT JOIN addresses ba ON o.billing_address_id = ba.address_id
        WHERE o.order_id = ?
      `, [orderId]);

      const order = newOrders[0];

      // Get order items
      const [orderItems] = await connection.query(`
        SELECT 
          oi.order_item_id,
          oi.order_id,
          oi.variant_id,
          oi.quantity,
          oi.unit_price,
          p.base_name as product_name,
          v.size,
          v.color
        FROM order_items oi
        LEFT JOIN product_variants v ON oi.variant_id = v.variant_id
        LEFT JOIN products p ON v.product_id = p.product_id
        WHERE oi.order_id = ?
      `, [orderId]);

      order.items = orderItems || [];


      res.status(201).json({ 
        success: true, 
        message: "Order created successfully",
        data: order 
      });

    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    }

  } catch (err) {
    console.error('❌ Create order error:', err);
    if (connection) await connection.rollback();
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order',
      error: err.message 
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});



// ❌ Cancel order
router.patch('/:id/cancel', verifyClerkAuth, async (req, res) => {
  try {
    const { clerkUser } = req;
    const { id } = req.params;

    // Get user to verify ownership
    const user = await getUserByClerkId(clerkUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if order exists and belongs to user
    const [existingOrders] = await db.query(
      'SELECT * FROM orders WHERE order_id = ? AND user_id = ? AND status IN ("pending", "processing")',
      [id, user.user_id]
    );

    if (existingOrders.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found, already cancelled/delivered, or cannot be cancelled" 
      });
    }

    // Update order status to cancelled
    await db.query(
      'UPDATE orders SET status = "cancelled", updated_at = NOW() WHERE order_id = ? AND user_id = ?',
      [id, user.user_id]
    );


    res.json({ 
      success: true, 
      message: "Order cancelled successfully" 
    });
  } catch (err) {
    console.error('❌ Cancel order error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel order',
      error: err.message 
    });
  }
});


//admin api for order 
router.get('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const [orders] = await db.query(`
      SELECT 
        o.order_id,
        o.user_id,
        o.total_amount,
        o.status,
        o.tracking_number,
        o.created_at,
        o.updated_at,
        sa.street as shipping_street,
        sa.city as shipping_city,
        sa.state as shipping_state,
        sa.country as shipping_country,
        sa.postal_code as shipping_postal_code,
        ba.street as billing_street,
        ba.city as billing_city,
        ba.state as billing_state,
        ba.country as billing_country,
        ba.postal_code as billing_postal_code,
        u.email,
        u.first_name,
        u.last_name,
        u.phone
      FROM orders o
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.address_id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.address_id
      LEFT JOIN users u ON o.user_id = u.user_id
      ORDER BY o.created_at DESC
    `);

    // Get order items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await db.query(`
          SELECT 
            oi.order_item_id,
            oi.order_id,
            oi.variant_id,
            oi.quantity,
            oi.unit_price,
            p.base_name as product_name,
            p.base_name,
            pv.sku,
            pv.color,
            pv.size,
            pv.material
          FROM order_items oi
          LEFT JOIN product_variants pv ON oi.variant_id = pv.variant_id
          LEFT JOIN products p ON pv.product_id = p.product_id
          WHERE oi.order_id = ?
        `, [order.order_id]);

        return {
          ...order,
          items: items || [],
          customer: {
            email: order.email,
            first_name: order.first_name,
            last_name: order.last_name,
            phone: order.phone
          }
        };
      })
    );

    res.json({ 
      success: true, 
      data: ordersWithItems 
    });
  } catch (err) {
    console.error('❌ Get admin orders error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
      error: err.message 
    });
  }
});

// Update order status (admin only)
router.put('/:id/status', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
    }

    const [result] = await db.query(
      'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    res.json({ 
      success: true, 
      message: `Order status updated to ${status}` 
    });
  } catch (err) {
    console.error('❌ Update order status error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update order status',
      error: err.message 
    });
  }
});

// Cancel order (admin only)
router.patch('/:id/cancel', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      'UPDATE orders SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    res.json({ 
      success: true, 
      message: "Order cancelled successfully" 
    });
  } catch (err) {
    console.error('❌ Cancel order error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel order',
      error: err.message 
    });
  }
});
// --------------------
// 🩺 Health check
// --------------------
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Order routes are working!',
  });
});

export default router;