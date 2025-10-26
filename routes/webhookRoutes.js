// backend/routes/webhookRoutes.js
import express from 'express';
import { Webhook } from 'svix';
import db from '../database.js';

const router = express.Router();

// Clerk webhook handler
router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('❌ CLERK_WEBHOOK_SECRET is missing');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Get the headers
  const svix_id = req.headers['svix-id'];
  const svix_timestamp = req.headers['svix-timestamp'];
  const svix_signature = req.headers['svix-signature'];

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('❌ Missing Svix headers');
    return res.status(400).json({ error: 'Missing Svix headers' });
  }

  // Get the raw body
  const payload = req.body;
  const body = JSON.stringify(payload);



  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    console.error('❌ Error verifying webhook:', err);
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Handle the webhook
  const eventType = evt.type;
  


  try {
    if (eventType === 'user.created' || eventType === 'user.updated') {
      await handleUserSync(evt.data);
    } else if (eventType === 'user.deleted') {
      await handleUserDeletion(evt.data);
    }

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

async function handleUserSync(clerkUser) {
  const { id, email_addresses, first_name, last_name } = clerkUser;
  const email = email_addresses[0]?.email_address;

  if (!email) {
    throw new Error('No email found for user');
  }



  // Check if user exists in your database
  const [existingUsers] = await db.query(
    'SELECT * FROM users WHERE clerk_id = ? OR email = ?', 
    [id, email]
  );

  if (existingUsers.length > 0) {
    // Update existing user
    await db.query(
      'UPDATE users SET clerk_id = ?, first_name = ?, last_name = ?, updated_at = NOW() WHERE email = ?',
      [id, first_name, last_name, email]
    );

  } else {
    // Create new user
    const [result] = await db.query(
      `INSERT INTO users (clerk_id, email, first_name, last_name, role, created_at) 
       VALUES (?, ?, ?, ?, 'user', NOW())`,
      [id, email, first_name, last_name]
    );

  }
}

async function handleUserDeletion(clerkUser) {
  const { id } = clerkUser;
  

  
  await db.query(
    'DELETE FROM users WHERE clerk_id = ?',
    [id]
  );
  

}

export default router;