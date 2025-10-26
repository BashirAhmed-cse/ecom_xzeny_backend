import db from '../database.js';
import * as DiscountModel from '../models/DiscountModel.js';

// Create new discount tier
export const createDiscountTier = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      Discount_APPLY_type,
      discount_code,
      type,
      min_quantity,
      max_quantity,
      percentage_discount,
      fixed_discount,
      price_per_unit,
      free_ebook,
      free_shipping,
      label,
      description,
      is_active,
      start_date,
      end_date,
      translations,
      amounts
    } = req.body;



    // Insert into discount_tiers table
    const [tierResult] = await connection.query(
      `INSERT INTO discount_tiers (
        Discount_APPLY_type, discount_code, type, min_quantity, max_quantity,
        percentage_discount, fixed_discount, price_per_unit, free_ebook, free_shipping,
        label, description, is_active, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Discount_APPLY_type || 'AUTO',
        discount_code || null,
        type || 'amount_off_products',
        min_quantity || null,
        max_quantity || null,
        percentage_discount || null,
        fixed_discount || null,
        price_per_unit || null,
        free_ebook ? 1 : 0,
        free_shipping ? 1 : 0,
        label || '',
        description || '',
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        start_date || null,
        end_date || null
      ]
    );

    const tierId = tierResult.insertId;

    // Insert translations if provided
    if (translations && Array.isArray(translations)) {
      for (const translation of translations) {
        if (translation.label && translation.language_id) {
          await connection.query(
            `INSERT INTO discount_tier_translations (
              tier_id, language_id, label, description
            ) VALUES (?, ?, ?, ?)`,
            [
              tierId,
              translation.language_id,
              translation.label,
              translation.description || ''
            ]
          );
        }
      }
    }

    // Insert discount amounts if provided
    if (amounts && Array.isArray(amounts)) {
      for (const amount of amounts) {
        if (amount.value !== undefined && amount.amount_type && amount.applies_to) {
          await connection.query(
            `INSERT INTO discount_amounts (
              discount_id, amount_type, value, applies_to
            ) VALUES (?, ?, ?, ?)`,
            [
              tierId,
              amount.amount_type,
              amount.value,
              amount.applies_to
            ]
          );
        }
      }
    }

    await connection.commit();

    // Fetch the created tier with translations and amounts
    const [createdTier] = await connection.query(
      `SELECT 
        dt.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'translation_id', dtt.translation_id,
            'language_id', dtt.language_id,
            'label', dtt.label,
            'description', dtt.description,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'amount_id', da.amount_id,
            'amount_type', da.amount_type,
            'value', da.value,
            'applies_to', da.applies_to
          )
        ) as amounts
      FROM discount_tiers dt
      LEFT JOIN discount_tier_translations dtt ON dt.tier_id = dtt.tier_id
      LEFT JOIN languages l ON dtt.language_id = l.language_id
      LEFT JOIN discount_amounts da ON dt.tier_id = da.discount_id
      WHERE dt.tier_id = ?
      GROUP BY dt.tier_id`,
      [tierId]
    );

    res.status(201).json({
      success: true,
      message: 'Discount tier created successfully',
      data: createdTier[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating discount tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create discount tier',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Get all discount tiers
export const getDiscountTiers = async (req, res) => {
  try {
    const { is_active, type, include_inactive = false } = req.query;

    let query = `
      SELECT 
        dt.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'translation_id', dtt.translation_id,
            'language_id', dtt.language_id,
            'label', dtt.label,
            'description', dtt.description,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'amount_id', da.amount_id,
            'amount_type', da.amount_type,
            'value', da.value,
            'applies_to', da.applies_to
          )
        ) as amounts
      FROM discount_tiers dt
      LEFT JOIN discount_tier_translations dtt ON dt.tier_id = dtt.tier_id
      LEFT JOIN languages l ON dtt.language_id = l.language_id
      LEFT JOIN discount_amounts da ON dt.tier_id = da.discount_id
    `;

    const conditions = [];
    const params = [];

    // Filter by active status
    if (is_active !== undefined) {
      conditions.push('dt.is_active = ?');
      params.push(is_active);
    } else if (!include_inactive) {
      conditions.push('dt.is_active = 1');
    }

    // Filter by type
    if (type) {
      conditions.push('dt.type = ?');
      params.push(type);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY dt.tier_id ORDER BY dt.created_at DESC`;

    const [tiers] = await db.query(query, params);

    // Process the results
    const processedTiers = tiers.map(tier => {
      // Parse JSON fields and filter out null values
      const translations = tier.translations ? tier.translations.filter(t => t.language_id) : [];
      const amounts = tier.amounts ? tier.amounts.filter(a => a.amount_id) : [];

      return {
        ...tier,
        free_ebook: tier.free_ebook === 1,
        free_shipping: tier.free_shipping === 1,
        is_active: tier.is_active === 1,
        translations,
        amounts
      };
    });

    res.json({
      success: true,
      data: processedTiers,
      count: processedTiers.length
    });

  } catch (error) {
    console.error('Error fetching discount tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discount tiers',
      error: error.message
    });
  }
};

// Get active discount tiers for public display
export const getActiveDiscountTiers = async (req, res) => {
  try {
    const { language_code = 'en', type } = req.query;

    let query = `
      SELECT 
        dt.tier_id,
        dt.Discount_APPLY_type,
        dt.discount_code,
        dt.type,
        dt.min_quantity,
        dt.max_quantity,
        dt.percentage_discount,
        dt.fixed_discount,
        dt.price_per_unit,
        dt.free_ebook,
        dt.free_shipping,
        dt.start_date,
        dt.end_date,
        COALESCE(dtt.label, dt.label) as label,
        COALESCE(dtt.description, dt.description) as description,
        da.amount_type,
        da.value,
        da.applies_to
      FROM discount_tiers dt
      LEFT JOIN discount_tier_translations dtt ON dt.tier_id = dtt.tier_id
      LEFT JOIN languages l ON dtt.language_id = l.language_id AND l.code = ?
      LEFT JOIN discount_amounts da ON dt.tier_id = da.discount_id
      WHERE dt.is_active = 1
        AND (dt.start_date IS NULL OR dt.start_date <= CURDATE())
        AND (dt.end_date IS NULL OR dt.end_date >= CURDATE())
    `;

    const params = [language_code];

    if (type) {
      query += ` AND dt.type = ?`;
      params.push(type);
    }

    query += ` ORDER BY dt.created_at DESC`;

    const [tiers] = await db.query(query, params);

    // Group amounts by tier
    const groupedTiers = tiers.reduce((acc, tier) => {
      const existingTier = acc.find(t => t.tier_id === tier.tier_id);
      
      if (existingTier) {
        if (tier.amount_id) {
          existingTier.amounts.push({
            amount_id: tier.amount_id,
            amount_type: tier.amount_type,
            value: tier.value,
            applies_to: tier.applies_to
          });
        }
      } else {
        acc.push({
          tier_id: tier.tier_id,
          Discount_APPLY_type: tier.Discount_APPLY_type,
          discount_code: tier.discount_code,
          type: tier.type,
          min_quantity: tier.min_quantity,
          max_quantity: tier.max_quantity,
          percentage_discount: tier.percentage_discount,
          fixed_discount: tier.fixed_discount,
          price_per_unit: tier.price_per_unit,
          free_ebook: tier.free_ebook === 1,
          free_shipping: tier.free_shipping === 1,
          start_date: tier.start_date,
          end_date: tier.end_date,
          label: tier.label,
          description: tier.description,
          amounts: tier.amount_id ? [{
            amount_id: tier.amount_id,
            amount_type: tier.amount_type,
            value: tier.value,
            applies_to: tier.applies_to
          }] : []
        });
      }
      
      return acc;
    }, []);

    res.json({
      success: true,
      data: groupedTiers
    });

  } catch (error) {
    console.error('Error fetching active discount tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active discount tiers',
      error: error.message
    });
  }
};

// Get discount tier by ID
export const getDiscountTierById = async (req, res) => {
  try {
    const { id } = req.params;

    const [tiers] = await db.query(
      `SELECT 
        dt.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'translation_id', dtt.translation_id,
            'language_id', dtt.language_id,
            'label', dtt.label,
            'description', dtt.description,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'amount_id', da.amount_id,
            'amount_type', da.amount_type,
            'value', da.value,
            'applies_to', da.applies_to
          )
        ) as amounts
      FROM discount_tiers dt
      LEFT JOIN discount_tier_translations dtt ON dt.tier_id = dtt.tier_id
      LEFT JOIN languages l ON dtt.language_id = l.language_id
      LEFT JOIN discount_amounts da ON dt.tier_id = da.discount_id
      WHERE dt.tier_id = ?
      GROUP BY dt.tier_id`,
      [id]
    );

    if (tiers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Discount tier not found'
      });
    }

    const tier = tiers[0];
    const translations = tier.translations ? tier.translations.filter(t => t.language_id) : [];
    const amounts = tier.amounts ? tier.amounts.filter(a => a.amount_id) : [];

    const processedTier = {
      ...tier,
      free_ebook: tier.free_ebook === 1,
      free_shipping: tier.free_shipping === 1,
      is_active: tier.is_active === 1,
      translations,
      amounts
    };

    res.json({
      success: true,
      data: processedTier
    });

  } catch (error) {
    console.error('Error fetching discount tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discount tier',
      error: error.message
    });
  }
};

// Update discount tier
export const updateDiscountTier = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      Discount_APPLY_type,
      discount_code,
      type,
      min_quantity,
      max_quantity,
      percentage_discount,
      fixed_discount,
      price_per_unit,
      free_ebook,
      free_shipping,
      label,
      description,
      is_active,
      start_date,
      end_date,
      translations,
      amounts
    } = req.body;



    // Update main tier
    const updateFields = [];
    const updateParams = [];

    if (Discount_APPLY_type !== undefined) {
      updateFields.push('Discount_APPLY_type = ?');
      updateParams.push(Discount_APPLY_type);
    }
    if (discount_code !== undefined) {
      updateFields.push('discount_code = ?');
      updateParams.push(discount_code);
    }
    if (type !== undefined) {
      updateFields.push('type = ?');
      updateParams.push(type);
    }
    if (min_quantity !== undefined) {
      updateFields.push('min_quantity = ?');
      updateParams.push(min_quantity);
    }
    if (max_quantity !== undefined) {
      updateFields.push('max_quantity = ?');
      updateParams.push(max_quantity);
    }
    if (percentage_discount !== undefined) {
      updateFields.push('percentage_discount = ?');
      updateParams.push(percentage_discount);
    }
    if (fixed_discount !== undefined) {
      updateFields.push('fixed_discount = ?');
      updateParams.push(fixed_discount);
    }
    if (price_per_unit !== undefined) {
      updateFields.push('price_per_unit = ?');
      updateParams.push(price_per_unit);
    }
    if (free_ebook !== undefined) {
      updateFields.push('free_ebook = ?');
      updateParams.push(free_ebook ? 1 : 0);
    }
    if (free_shipping !== undefined) {
      updateFields.push('free_shipping = ?');
      updateParams.push(free_shipping ? 1 : 0);
    }
    if (label !== undefined) {
      updateFields.push('label = ?');
      updateParams.push(label);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateParams.push(description);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateParams.push(is_active ? 1 : 0);
    }
    if (start_date !== undefined) {
      updateFields.push('start_date = ?');
      updateParams.push(start_date);
    }
    if (end_date !== undefined) {
      updateFields.push('end_date = ?');
      updateParams.push(end_date);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    if (updateFields.length > 0) {
      const updateQuery = `UPDATE discount_tiers SET ${updateFields.join(', ')} WHERE tier_id = ?`;
      updateParams.push(id);
      
      await connection.query(updateQuery, updateParams);
    }

    // Update translations if provided
    if (translations && Array.isArray(translations)) {
      // Get existing translations
      const [existingTranslations] = await connection.query(
        'SELECT translation_id, language_id FROM discount_tier_translations WHERE tier_id = ?',
        [id]
      );

      const existingTranslationMap = new Map();
      existingTranslations.forEach(trans => {
        existingTranslationMap.set(trans.language_id, trans.translation_id);
      });

      for (const translation of translations) {
        if (translation.language_id) {
          const existingTranslationId = existingTranslationMap.get(translation.language_id);
          
          if (existingTranslationId) {
            // Update existing translation
            await connection.query(
              `UPDATE discount_tier_translations 
               SET label = ?, description = ? 
               WHERE translation_id = ? AND tier_id = ?`,
              [translation.label || '', translation.description || '', existingTranslationId, id]
            );
          } else if (translation.label) {
            // Insert new translation
            await connection.query(
              `INSERT INTO discount_tier_translations (
                tier_id, language_id, label, description
              ) VALUES (?, ?, ?, ?)`,
              [id, translation.language_id, translation.label, translation.description || '']
            );
          }
        }
      }
    }

    // Update amounts if provided
    if (amounts && Array.isArray(amounts)) {
      // Delete existing amounts
      await connection.query('DELETE FROM discount_amounts WHERE discount_id = ?', [id]);
      
      // Insert new amounts
      for (const amount of amounts) {
        if (amount.value !== undefined && amount.amount_type && amount.applies_to) {
          await connection.query(
            `INSERT INTO discount_amounts (
              discount_id, amount_type, value, applies_to
            ) VALUES (?, ?, ?, ?)`,
            [id, amount.amount_type, amount.value, amount.applies_to]
          );
        }
      }
    }

    await connection.commit();

    // Fetch updated tier
    const [updatedTier] = await connection.query(
      `SELECT 
        dt.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'translation_id', dtt.translation_id,
            'language_id', dtt.language_id,
            'label', dtt.label,
            'description', dtt.description,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'amount_id', da.amount_id,
            'amount_type', da.amount_type,
            'value', da.value,
            'applies_to', da.applies_to
          )
        ) as amounts
      FROM discount_tiers dt
      LEFT JOIN discount_tier_translations dtt ON dt.tier_id = dtt.tier_id
      LEFT JOIN languages l ON dtt.language_id = l.language_id
      LEFT JOIN discount_amounts da ON dt.tier_id = da.discount_id
      WHERE dt.tier_id = ?
      GROUP BY dt.tier_id`,
      [id]
    );

    res.json({
      success: true,
      message: 'Discount tier updated successfully',
      data: updatedTier[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating discount tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update discount tier',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Delete discount tier
export const deleteDiscountTier = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Delete translations first
    await connection.query('DELETE FROM discount_tier_translations WHERE tier_id = ?', [id]);
    
    // Delete amounts
    await connection.query('DELETE FROM discount_amounts WHERE discount_id = ?', [id]);
    
    // Delete tier
    const [result] = await connection.query('DELETE FROM discount_tiers WHERE tier_id = ?', [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Discount tier not found'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Discount tier deleted successfully'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error deleting discount tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete discount tier',
      error: error.message
    });
  } finally {
    connection.release();
  }
};


export const createFlashDiscount = async (req, res) => {
  try {
    const discountData = req.body;


    // Validate required fields
    if (!discountData.product_id) {
      return res.status(400).json({ 
        success: false,
        message: "Product ID is required." 
      });
    }

    const flashId = await DiscountModel.createFlashDiscount(discountData);
    
    // Return the structure that React expects
    return res.status(201).json({
      success: true,
      message: "Flash discount created successfully",
      data: { flash_id: flashId }
    });
  } catch (error) {
    console.error("❌ createFlashDiscount error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
}

export const getFlashDiscount = async (req, res) => {
  try {
    const { product_id } = req.params;



    const data = await DiscountModel.getFlashDiscounts(product_id);


    if (!data || data.length === 0) {
      return res.status(200).json([]); // Return empty array, not 404
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Error in getFlashDiscount:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};


export const updateFlashDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updated = await DiscountModel.updateFlashDiscount(id, updateData);

    // Update translations if provided
    if (updateData.translations && updateData.translations.length > 0) {
      await DiscountModel.updateTranslations(id, updateData.translations);
    }

    if (!updated) {
      return res.status(404).json({ 
        success: false,
        message: "Flash discount not found or not updated" 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "Flash discount updated successfully" 
    });
  } catch (error) {
    console.error("❌ updateFlashDiscount error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
}

export const deleteFlashDiscount = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await DiscountModel.deleteFlashDiscount(id);
    if (!deleted) {
      return res.status(404).json({ 
        success: false,
        message: "Flash discount not found" 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "Flash discount deleted successfully" 
    });
  } catch (error) {
    console.error("❌ deleteFlashDiscount error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
}