import { Router } from 'express';
import { use, authenticate } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { sign } from 'jsonwebtoken';
import { query } from './db';
const router = Router();

use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
}, async (accessToken, refreshToken, profile, done) => {
  // Save user to DB if not exists
  const email = profile.emails[0].value;
  const [rows] = await query('SELECT * FROM users WHERE email = ?', [email]);
  let user;
  if (rows.length === 0) {
    const [result] = await query('INSERT INTO users (name, email, google_id) VALUES (?, ?, ?)', [profile.displayName, email, profile.id]);
    user = { id: result.insertId, name: profile.displayName, email };
  } else {
    user = rows[0];
  }
  done(null, user);
}));

router.get('/google', authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', authenticate('google', { session: false }), (req, res) => {
  const token = sign(req.user, process.env.JWT_SECRET, { expiresIn: '7d' });
  // Redirect frontend with token
  res.redirect(`${process.env.FRONTEND_URL}/?token=${token}`);
});

export default router;
