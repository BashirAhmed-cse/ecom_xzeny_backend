import db from '../database.js';

/**
 * 🟢 Create a new flash discount with optional translations
 */
export const createFlashDiscount = async (discountData) => {
  const {
    product_id,
    percentage_discount,
    fixed_discount,
    duration_minutes,
    trigger_condition,
    message,
    is_active,
    start_date,
    end_date,
    translations
  } = discountData;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Insert main flash discount
    const [result] = await connection.execute(
      `INSERT INTO flash_discounts 
       (product_id, percentage_discount, fixed_discount, duration_minutes, 
        trigger_condition, message, is_active, start_date, end_date, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        product_id,
        percentage_discount,
        fixed_discount,
        duration_minutes,
        trigger_condition,
        message,
        is_active,
        start_date || null,
        end_date || null
      ]
    );

    const flashId = result.insertId;

    // Insert translations if provided
    if (translations && translations.length > 0) {
      for (const translation of translations) {
        if (translation.message && translation.message.trim()) {
          await connection.execute(
            `INSERT INTO flash_discount_translations 
             (flash_id, language_id, message) 
             VALUES (?, ?, ?)`,
            [flashId, translation.language_id, translation.message]
          );
        }
      }
    }

    await connection.commit();
    return flashId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 🟢 Get all flash discounts (optionally filter by product)
 */
export const getFlashDiscounts = async (productId = null) => {
  try {
    let query = `
      SELECT 
        fd.*,
     
        p.base_name as base_name,
        p.sku as product_sku,
        p.sale_price as product_price,
        p.base_price as product_base_price,
        GROUP_CONCAT(
          DISTINCT JSON_OBJECT(
            'translation_id', fdt.translation_id,
            'language_id', fdt.language_id,
            'message', fdt.message,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations
      FROM flash_discounts fd
      LEFT JOIN products p ON fd.product_id = p.product_id
      LEFT JOIN flash_discount_translations fdt ON fd.flash_id = fdt.flash_id
      LEFT JOIN languages l ON fdt.language_id = l.language_id
      WHERE 1=1
    `;

    const params = [];

    if (productId) {
      query += ` AND fd.product_id = ?`;
      params.push(productId);
    }

    query += ` GROUP BY fd.flash_id ORDER BY fd.created_at DESC`;



    const [rows] = await db.execute(query, params);


    // Always return an array
    if (!rows || rows.length === 0) {

      return [];
    }

    // Parse the data
    const discounts = rows.map(row => {
      let translations = [];
      try {
        if (row.translations) {
          translations = JSON.parse(`[${row.translations}]`).filter(t => t.translation_id);
        }
      } catch (e) {
        console.error('Error parsing translations:', e);
      }

      return {
        flash_id: row.flash_id,
        product_id: row.product_id,
        percentage_discount: row.percentage_discount,
        fixed_discount: row.fixed_discount,
        duration_minutes: row.duration_minutes,
        trigger_condition: row.trigger_condition,
        message: row.message,
        is_active: Boolean(row.is_active),
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        translations: translations,
        product: row.product_name ? {
          product_id: row.product_id,
          name: row.product_name,
          base_name: row.product_base_name,
          sku: row.product_sku,
          price: row.product_price,
          base_price: row.product_base_price
        } : null
      };
    });

  
    return discounts;

  } catch (error) {
    console.error('Error in getFlashDiscounts:', error);
    return []; // Return empty array on error
  }
}

/**
 * 🟢 Get single flash discount by ID
 */
export const getFlashDiscountById = async (flashId) => {
  const [rows] = await db.execute(
    `SELECT 
      fd.*,
      p.name as product_name,
      p.sku as product_sku,
      p.price as product_price,
      GROUP_CONCAT(
        JSON_OBJECT(
          'translation_id', fdt.translation_id,
          'language_id', fdt.language_id,
          'message', fdt.message,
          'language_code', l.code,
          'language_name', l.name
        )
      ) as translations
     FROM flash_discounts fd
     LEFT JOIN products p ON fd.product_id = p.product_id
     LEFT JOIN flash_discount_translations fdt ON fd.flash_id = fdt.flash_id
     LEFT JOIN languages l ON fdt.language_id = l.language_id
     WHERE fd.flash_id = ?
     GROUP BY fd.flash_id`,
    [flashId]
  );

  if (rows.length === 0) return null;

  const discount = rows[0];
  return {
    ...discount,
    translations: discount.translations
      ? JSON.parse(`[${discount.translations}]`).filter(t => t.translation_id)
      : []
  };
};

/**
 * 🟡 Update flash discount main record
 */
export const updateFlashDiscount = async (flashId, updateData) => {
  const allowedFields = [
    'is_active',
    'percentage_discount',
    'fixed_discount',
    'duration_minutes',
    'trigger_condition',
    'message',
    'start_date',
    'end_date'
  ];

  const updates = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(updateData[field]);
    }
  }

  if (updates.length === 0) throw new Error('No valid fields to update');

  updates.push('updated_at = NOW()');
  params.push(flashId);

  const [result] = await db.execute(
    `UPDATE flash_discounts SET ${updates.join(', ')} WHERE flash_id = ?`,
    params
  );

  return result.affectedRows > 0;
};

/**
 * 🔴 Delete flash discount (and its translations)
 */
export const deleteFlashDiscount = async (flashId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      'DELETE FROM flash_discount_translations WHERE flash_id = ?',
      [flashId]
    );

    const [result] = await connection.execute(
      'DELETE FROM flash_discounts WHERE flash_id = ?',
      [flashId]
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 🟢 Update translations for an existing flash discount
 */
export const updateTranslations = async (flashId, translations) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      'DELETE FROM flash_discount_translations WHERE flash_id = ?',
      [flashId]
    );

    for (const translation of translations) {
      if (translation.message && translation.message.trim()) {
        await connection.execute(
          `INSERT INTO flash_discount_translations 
           (flash_id, language_id, message) 
           VALUES (?, ?, ?)`,
          [flashId, translation.language_id, translation.message]
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
