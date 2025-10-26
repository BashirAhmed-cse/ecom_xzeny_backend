import db from '../database.js';

// ✅ GET all categories
export const getAllCategories = async () => {
  const [rows] = await db.query(`
    SELECT 
      c.category_id AS id,
      c.name AS default_name,
      c.description AS default_description,
      CASE c.is_active WHEN 'Y' THEN 'active' ELSE 'inactive' END AS is_active,
      c.created_at,
      l.code AS lang_code,
      ct.name AS translated_name,
      ct.description AS translated_description
    FROM categories c
    LEFT JOIN category_translations ct ON c.category_id = ct.category_id
    LEFT JOIN languages l ON ct.language_id = l.language_id
    ORDER BY c.name
  `);

  // 🧩 Group translations by category
  const categoriesMap = {};

  for (const row of rows) {
    if (!categoriesMap[row.id]) {
      categoriesMap[row.id] = {
        id: row.id,
        name: row.default_name,
        description: row.default_description,
        is_active: row.is_active,
        created_at: row.created_at,
        translations: {},
      };
    }

    if (row.lang_code) {
      categoriesMap[row.id].translations[row.lang_code] = {
        name: row.translated_name,
        description: row.translated_description,
      };
    }
  }

  return Object.values(categoriesMap);
};


// ✅ GET category by ID
export const getCategoryById = async (id) => {
  const [rows] = await db.query(
    'SELECT category_id AS id, name, description, CASE is_active WHEN "Y" THEN "active" WHEN "N" THEN "inactive" END AS is_active, created_at FROM categories WHERE category_id = ?',
    [id]
  );
  return rows[0];
};


// ✅ Create new category
export const createCategory = async (data) => {
  const { name, description } = data;
  const [result] = await db.query(
    `INSERT INTO categories (name, description, is_active, created_at)
     VALUES (?, ?, 'Y', CURRENT_TIMESTAMP)`,
    [name, description || null]
  );
  return result.insertId;
};

// ✅ Add translations
export const addCategoryTranslations = async (categoryId, translations) => {
  const values = translations
    .filter((t) => t.name && t.language_id)
    .map((t) => [categoryId, t.language_id, t.name, t.description || null]);

  if (values.length === 0) return;

  await db.query(
    `INSERT INTO category_translations (category_id, language_id, name, description)
     VALUES ?`,
    [values]
  );
};

// ✅ UPDATE category
export const updateCategory = async (id, { name, description, is_active }) => {
  const fields = [];
  const values = [];
  
  if (name) {
    fields.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description || null);
  }
  if (is_active) {
    fields.push('is_active = ?');
    values.push(is_active === 'active' ? 'Y' : 'N');
  }
  
  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  const query = `UPDATE categories SET ${fields.join(', ')} WHERE category_id = ?`;
  values.push(id);
  
  const [result] = await db.query(query, values);
  if (result.affectedRows === 0) {
    throw new Error('Category not found');
  }
  
  const [updated] = await db.query(
    'SELECT category_id AS id, name, description, CASE is_active WHEN "Y" THEN "active" WHEN "N" THEN "inactive" END AS is_active, created_at FROM categories WHERE category_id = ?',
    [id]
  );
  return updated[0];
};

// ✅ DELETE category
export const deleteCategory = async (id) => {
  const [result] = await db.query('DELETE FROM categories WHERE category_id = ?', [id]);
  if (result.affectedRows === 0) {
    throw new Error('Category not found');
  }
};