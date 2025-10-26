import db from '../database.js';
import bcrypt from 'bcryptjs';

export const getAllUsers = async () => {
  const [rows] = await db.query('SELECT user_id, email, first_name, last_name, role, created_at FROM users');
  return rows;
};

export const getUserByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

export const getUserById = async (userId) => {
  const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [userId]);
  return rows[0];
};

export const createUser = async (user) => {
  const { email, password, first_name, last_name, role } = user;
  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    'INSERT INTO users (email, password_hash, first_name, last_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
    [email, password_hash, first_name, last_name, role]
  );
  return result.insertId;
};