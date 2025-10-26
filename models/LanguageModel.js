import db from '../database.js';

// ✅ GET all Languages
export const getAllLanguage = async () => {
  const [rows] = await db.query(
    'SELECT * FROM languages WHERE is_active = 1 ORDER BY name ASC;'
  );
  return rows;
};
