import * as SettingModel from "../models/settingModel.js";
import db from '../database.js';

// 🎨 COLORS
export const getColors = async (req, res) => {
  try {
    const colors = await SettingModel.getAllColors();
    res.json(colors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createColor = async (req, res) => {
  try {
    const { name, hex_value } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (hex_value && !/^#[0-9A-Fa-f]{6}$/.test(hex_value)) {
      return res.status(400).json({ error: "Invalid hex color format" });
    }
    const id = await SettingModel.createColor({ name, hex_value });
    res.status(201).json({ message: "Color created", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateColor = async (req, res) => {
  try {
    const { colorId } = req.params;
    const { name, hex_value, is_active } = req.body;

    if (!name && !hex_value && !is_active) {
      return res.status(400).json({ error: "At least one field (name, hex_value, or is_active) is required" });
    }
    if (name && name.trim() === "") {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    if (hex_value && !/^#[0-9A-Fa-f]{6}$/.test(hex_value)) {
      return res.status(400).json({ error: "Invalid hex color format" });
    }
    if (is_active && !["active", "inactive"].includes(is_active)) {
      return res.status(400).json({ error: "Invalid status, must be 'active' or 'inactive'" });
    }
    const updatedColor = await SettingModel.updateColor(parseInt(colorId), {
      name,
      hex_value,
      is_active,
    });
    res.status(200).json(updatedColor);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update color" });
  }
};

export const deleteColor = async (req, res) => {
  try {
    const { colorId } = req.params;
    await SettingModel.deleteColor(parseInt(colorId));
    res.status(200).json({ message: "Color deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete color" });
  }
};

// 📏 SIZES
export const getSizes = async (req, res) => {
  try {
    const sizes = await SettingModel.getAllSizes();
    res.json(sizes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createSize = async (req, res) => {
  try {
    const { name, translations = {} } = req.body;

    // ✅ Validation
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (name.length > 10)
      return res
        .status(400)
        .json({ error: "Size name must be 10 characters or less" });
    if (!/^[A-Za-z0-9]+$/.test(name))
      return res
        .status(400)
        .json({ error: "Size name must be alphanumeric" });

    // ✅ Create main size (English)
    const size_id = await SettingModel.createSize({ name });

    // ✅ Handle translations (if any)
    if (Object.keys(translations).length > 0) {
      await SettingModel.createSizeTranslations(size_id, translations);
    }

    res.status(201).json({
      message: "Size created successfully",
      size_id,
    });
  } catch (err) {
    console.error("Error creating size:", err);
    res.status(500).json({ error: err.message });
  }
};


export const updateSize = async (req, res) => {
  try {
    const { sizeId } = req.params;
    const { name, is_active } = req.body;

    if (!name && !is_active) {
      return res.status(400).json({ error: "At least one field (name or is_active) is required" });
    }
    if (name && name.trim() === "") {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    if (name && name.length > 10) {
      return res.status(400).json({ error: "Size name must be 10 characters or less" });
    }
    if (name && !/^[A-Z0-9]+$/.test(name)) {
      return res.status(400).json({ error: "Size name must be alphanumeric" });
    }
    if (is_active && !["active", "inactive"].includes(is_active)) {
      return res.status(400).json({ error: "Invalid status, must be 'active' or 'inactive'" });
    }
    const updatedSize = await SettingModel.updateSize(parseInt(sizeId), {
      name,
      is_active,
    });
    res.status(200).json(updatedSize);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update size" });
  }
};

export const deleteSize = async (req, res) => {
  try {
    const { sizeId } = req.params;
    await SettingModel.deleteSize(parseInt(sizeId));
    res.status(200).json({ message: "Size deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete size" });
  }
};

// controllers/pageController.js
// controllers/settingController.js

// Get all pages with their translations
export const getAllPages = async (req, res) => {
  try {
    // First get all pages
    const [pages] = await db.query(`
      SELECT 
        id,
        slug,
        title,
        content,
        meta_title,
        meta_description,
        is_active,
        created_at,
        updated_at
      FROM pages 
      ORDER BY created_at DESC
    `);

    // Then get translations for each page
    for (let page of pages) {
      const [translations] = await db.query(`
        SELECT 
          pt.id,
          pt.language_id,
          l.code as language_code,
          pt.title,
          pt.content
        FROM page_translations pt
        LEFT JOIN languages l ON pt.language_id = l.language_id
        WHERE pt.page_id = ?
      `, [page.id]);
      
      page.translations = translations;
    }
    
    res.json(pages);
  } catch (err) {
    console.error("Error fetching pages:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Delete a page and its translations
export const deletePage = async (req, res) => {
  const { id } = req.params;
  try {
    // First delete translations
    await db.query("DELETE FROM page_translations WHERE page_id = ?", [id]);
    // Then delete the page
    await db.query("DELETE FROM pages WHERE id = ?", [id]);
    
    res.json({
      success: true,
      message: "Page deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting page:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Toggle page active status
export const togglePageStatus = async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    await db.query("UPDATE pages SET is_active = ?, updated_at = NOW() WHERE id = ?", [is_active, id]);
    
    res.json({
      success: true,
      message: `Page ${is_active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (err) {
    console.error("Error updating page status:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
export const getPage = async (req, res) => {
  const { slug } = req.params;
  try {
    // Get the main page data
    const [pages] = await db.query("SELECT * FROM pages WHERE slug = ?", [slug]);
    
    if (pages.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Page not found"
      });
    }

    const page = pages[0];

    // Get translations for this page
    const [translations] = await db.query(`
      SELECT 
        pt.id,
        pt.language_id,
        l.code as language_code,
        pt.title,
        pt.content
      FROM page_translations pt
      LEFT JOIN languages l ON pt.language_id = l.language_id
      WHERE pt.page_id = ?
    `, [page.id]);

    // Combine page data with translations
    const pageWithTranslations = {
      ...page,
      translations: translations
    };

    res.json(pageWithTranslations);
  } catch (err) {
    console.error("Error fetching page:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
// Create or update page
export const createPage = async (req, res) => {
  const { slug } = req.params;
  const { pageId, title, content, translations, meta_title, meta_description } = req.body;
  


  try {
    const result = await SettingModel.createOrUpdatePage({ 
      pageId, 
      slug: slug, // Use the slug from URL params
      title, 
      content, 
      meta_title, 
      meta_description, 
      translations 
    });
    res.json(result);
  } catch (err) {
    console.error("💥 Controller error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};


// controllers/seoController.js
export const createGlobalSeo = async (req, res) => {
  try {
    const {
      basic_seo,
      social_media,
      analytics,
      additional_scripts,
      settings,
      structured_data
    } = req.body;



    // Validate required fields
    if (!basic_seo || !social_media || !analytics || !additional_scripts || !settings) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    // Handle undefined structured_data
    const safeStructuredData = structured_data || '';

    // Check if global SEO settings already exist
    const [existingSettings] = await db.query(
      "SELECT id FROM global_seo_settings LIMIT 1"
    );

    let result;

    if (existingSettings.length > 0) {
      // Update existing settings
      const [updateResult] = await db.query(
        `UPDATE global_seo_settings 
         SET basic_seo = ?, social_media = ?, analytics = ?, 
             additional_scripts = ?, settings = ?, structured_data = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          JSON.stringify(basic_seo),
          JSON.stringify(social_media),
          JSON.stringify(analytics),
          JSON.stringify(additional_scripts),
          JSON.stringify(settings),
          safeStructuredData,
          existingSettings[0].id
        ]
      );

      result = {
        success: true,
        message: "Global SEO settings updated successfully",
        id: existingSettings[0].id
      };
    } else {
      // Create new settings
      const [insertResult] = await db.query(
        `INSERT INTO global_seo_settings 
         (basic_seo, social_media, analytics, additional_scripts, settings, structured_data) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          JSON.stringify(basic_seo),
          JSON.stringify(social_media),
          JSON.stringify(analytics),
          JSON.stringify(additional_scripts),
          JSON.stringify(settings),
          safeStructuredData
        ]
      );

      result = {
        success: true,
        message: "Global SEO settings created successfully",
        id: insertResult.insertId
      };
    }


    res.json(result);

  } catch (err) {
    console.error("Error in createGlobalSeo:", err);
    console.error("SQL Error Details:", {
      message: err.message,
      code: err.code,
      sql: err.sql,
      sqlState: err.sqlState
    });
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const getGlobalSeo = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM global_seo_settings ORDER BY id DESC LIMIT 1"
    );

    if (rows.length === 0) {
      // Return default structure if no settings exist
      return res.json({
        basic_seo: {
          site_title: "",
          site_description: "",
          site_keywords: ""
        },
        social_media: {
          og_title: "",
          og_description: "",
          og_image: ""
        },
        analytics: {
          google_analytics_id: "",
          google_analytics_script: "",
          google_tag_manager_id: "",
          facebook_pixel_id: ""
        },
        additional_scripts: {
          header_scripts: "",
          footer_scripts: ""
        },
        settings: {
          enable_analytics: false,
          enable_facebook_pixel: false,
          enable_google_ads: false
        },
        structured_data: ""
      });
    }

    const settings = rows[0];

    // Check if fields are already objects (no need to parse) or strings (need to parse)
    const result = {
      basic_seo: {
        site_title: "",
        site_description: "",
        site_keywords: "",
        ...(typeof settings.basic_seo === 'object' ? settings.basic_seo : 
            settings.basic_seo ? JSON.parse(settings.basic_seo) : {})
      },
      social_media: {
        og_title: "",
        og_description: "",
        og_image: "",
        ...(typeof settings.social_media === 'object' ? settings.social_media : 
            settings.social_media ? JSON.parse(settings.social_media) : {})
      },
      analytics: {
        google_analytics_id: "",
        google_analytics_script: "",
        google_tag_manager_id: "",
        facebook_pixel_id: "",
        ...(typeof settings.analytics === 'object' ? settings.analytics : 
            settings.analytics ? JSON.parse(settings.analytics) : {})
      },
      additional_scripts: {
        header_scripts: "",
        footer_scripts: "",
        ...(typeof settings.additional_scripts === 'object' ? settings.additional_scripts : 
            settings.additional_scripts ? JSON.parse(settings.additional_scripts) : {})
      },
      settings: {
        enable_analytics: false,
        enable_facebook_pixel: false,
        enable_google_ads: false,
        ...(typeof settings.settings === 'object' ? settings.settings : 
            settings.settings ? JSON.parse(settings.settings) : {})
      },
      structured_data: settings.structured_data || ""
    };


    res.json(result);

  } catch (err) {
    console.error("Error in getGlobalSeo:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};



// Create new top header announcement
export const createTopHeader = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      type,
      message, // JSON field for backward compatibility
      background_color,
      text_color,
      link_url,
      is_active,
      start_date,
      end_date,
      priority,
      translations, // Array of translations { language_id, text }
      created_by
    } = req.body;



    // Insert into top_header table (id will be auto-generated)
    const [headerResult] = await connection.query(
      `INSERT INTO top_header (
        type, message, background_color, text_color, link_url, 
        is_active, start_date, end_date, priority, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type || 'info',
        message ? JSON.stringify(message) : null,
        background_color || '#000000',
        text_color || '#ffffff',
        link_url || null,
        is_active !== undefined ? is_active : 1,
        start_date || null,
        end_date || null,
        priority || 1,
        created_by || null,
        created_by || null
      ]
    );

    // Get the auto-generated ID
    const topHeaderId = headerResult.insertId;

    // Insert translations if provided
    if (translations && Array.isArray(translations)) {
      for (const translation of translations) {
        if (translation.text && translation.language_id) {
          await connection.query(
            `INSERT INTO top_header_translations (
              top_header_id, language_id, text, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              topHeaderId,
              translation.language_id,
              translation.text,
              created_by || null,
              created_by || null
            ]
          );
        }
      }
    }

    await connection.commit();

    // Fetch the created header with translations
    const [createdHeader] = await connection.query(
      `SELECT 
        th.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', tht.id,
            'language_id', tht.language_id,
            'text', tht.text,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations
      FROM top_header th
      LEFT JOIN top_header_translations tht ON th.id = tht.top_header_id
      LEFT JOIN languages l ON tht.language_id = l.language_id
      WHERE th.id = ?
      GROUP BY th.id`,
      [topHeaderId]
    );

    res.status(201).json({
      success: true,
      message: 'Top header announcement created successfully',
      data: createdHeader[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating top header:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create top header announcement',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Get all top header announcements
export const getTopHeader = async (req, res) => {
  try {
    const {
      language_id,
      is_active,
      type,
      include_inactive = false
    } = req.query;

    let query = `
      SELECT 
        th.id,
        th.type,
        th.message,
        th.background_color,
        th.text_color,
        th.link_url,
        th.is_active,
        th.start_date,
        th.end_date,
        th.priority,
        th.created_at,
        th.updated_at,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', tht.id,
            'language_id', tht.language_id,
            'text', tht.text,
            'language_code', l.code,
            'language_name', l.name
         
          )
        ) as translations
      FROM top_header th
      LEFT JOIN top_header_translations tht ON th.id = tht.top_header_id
      LEFT JOIN languages l ON tht.language_id = l.language_id
    `;

    const conditions = [];
    const params = [];

    // Filter by active status
    if (is_active !== undefined) {
      conditions.push('th.is_active = ?');
      params.push(is_active);
    } else if (!include_inactive) {
      conditions.push('th.is_active = 1');
    }

    // Filter by type
    if (type) {
      conditions.push('th.type = ?');
      params.push(type);
    }

    // Filter by specific language
    if (language_id) {
      conditions.push('tht.language_id = ?');
      params.push(language_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY th.id ORDER BY th.priority ASC, th.created_at DESC`;

    const [headers] = await db.query(query, params);

    // Process the results
    const processedHeaders = headers.map(header => {
      // Parse JSON fields
      const translations = header.translations ? header.translations.filter(t => t.language_id) : [];
      const message = header.message ? JSON.parse(header.message) : null;

      // Create texts object for easy access by language code
      const texts = translations.reduce((acc, trans) => {
        if (trans.language_code) {
          acc[trans.language_code] = trans.text;
        }
        return acc;
      }, {});

      return {
        ...header,
        message,
        translations,
        texts // Convenience field for frontend
      };
    });

    res.json({
      success: true,
      data: processedHeaders,
      count: processedHeaders.length
    });

  } catch (error) {
    console.error('Error fetching top headers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top header announcements',
      error: error.message
    });
  }
};

// Get active headers for public display
export const getActiveTopHeaders = async (req, res) => {
  try {
    const { language_code = 'en' } = req.query;

    const [headers] = await db.query(
      `SELECT 
        th.id,
        th.type,
        th.background_color,
        th.text_color,
        th.link_url,
        th.priority,
        tht.text,
        l.code as language_code
 
      FROM top_header th
      INNER JOIN top_header_translations tht ON th.id = tht.top_header_id
      INNER JOIN languages l ON tht.language_id = l.language_id
      WHERE th.is_active = 1
        AND l.code = ?
        AND (th.start_date IS NULL OR th.start_date <= NOW())
        AND (th.end_date IS NULL OR th.end_date >= NOW())
        AND l.is_active = 1
      ORDER BY th.priority ASC, th.created_at DESC`,
      [language_code]
    );

    res.json({
      success: true,
      data: headers
    });

  } catch (error) {
    console.error('Error fetching active top headers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active top headers',
      error: error.message
    });
  }
};

// Update top header announcement
// Update top header announcement
export const updateTopHeader = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      type,
      message,
      background_color,
      text_color,
      link_url,
      is_active,
      start_date,
      end_date,
      priority,
      translations,
      updated_by
    } = req.body;



    // Update main header
    const updateFields = [];
    const updateParams = [];

    if (type !== undefined) {
      updateFields.push('type = ?');
      updateParams.push(type);
    }
    if (message !== undefined) {
      updateFields.push('message = ?');
      updateParams.push(JSON.stringify(message));
    }
    if (background_color !== undefined) {
      updateFields.push('background_color = ?');
      updateParams.push(background_color);
    }
    if (text_color !== undefined) {
      updateFields.push('text_color = ?');
      updateParams.push(text_color);
    }
    if (link_url !== undefined) {
      updateFields.push('link_url = ?');
      updateParams.push(link_url);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateParams.push(is_active);
    }
    if (start_date !== undefined) {
      updateFields.push('start_date = ?');
      updateParams.push(start_date);
    }
    if (end_date !== undefined) {
      updateFields.push('end_date = ?');
      updateParams.push(end_date);
    }
    if (priority !== undefined) {
      updateFields.push('priority = ?');
      updateParams.push(priority);
    }
    if (updated_by !== undefined) {
      updateFields.push('updated_by = ?');
      updateParams.push(updated_by);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    if (updateFields.length > 0) {
      const updateQuery = `UPDATE top_header SET ${updateFields.join(', ')} WHERE id = ?`;
      updateParams.push(id);
      
      await connection.query(updateQuery, updateParams);
    }

    // Update translations if provided
    if (translations && Array.isArray(translations)) {
      // First, get existing translations for this header
      const [existingTranslations] = await connection.query(
        'SELECT id, language_id FROM top_header_translations WHERE top_header_id = ?',
        [id]
      );

      const existingTranslationMap = new Map();
      existingTranslations.forEach(trans => {
        existingTranslationMap.set(trans.language_id, trans.id);
      });

      for (const translation of translations) {
        if (translation.text && translation.language_id) {
          const existingTranslationId = existingTranslationMap.get(translation.language_id);
          
          if (existingTranslationId) {
            // Update existing translation
            await connection.query(
              `UPDATE top_header_translations 
               SET text = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
               WHERE id = ? AND top_header_id = ?`,
              [translation.text, updated_by, existingTranslationId, id]
            );
          } else {
            // Insert new translation only if it doesn't exist
            await connection.query(
              `INSERT INTO top_header_translations (
                top_header_id, language_id, text, created_by, updated_by
              ) VALUES (?, ?, ?, ?, ?)`,
              [
                id,
                translation.language_id,
                translation.text,
                updated_by || null,
                updated_by || null
              ]
            );
          }
        } else if (translation.text === '' && translation.language_id) {
          // If text is empty and translation exists, delete it
          const existingTranslationId = existingTranslationMap.get(translation.language_id);
          if (existingTranslationId) {
            await connection.query(
              'DELETE FROM top_header_translations WHERE id = ? AND top_header_id = ?',
              [existingTranslationId, id]
            );
          }
        }
      }
    }

    await connection.commit();

    // Fetch updated header
    const [updatedHeader] = await connection.query(
      `SELECT 
        th.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', tht.id,
            'language_id', tht.language_id,
            'text', tht.text,
            'language_code', l.code,
            'language_name', l.name
          )
        ) as translations
      FROM top_header th
      LEFT JOIN top_header_translations tht ON th.id = tht.top_header_id
      LEFT JOIN languages l ON tht.language_id = l.language_id
      WHERE th.id = ?
      GROUP BY th.id`,
      [id]
    );

    res.json({
      success: true,
      message: 'Top header announcement updated successfully',
      data: updatedHeader[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating top header:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update top header announcement',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Delete top header announcement
export const deleteTopHeader = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Delete translations first
    await connection.query('DELETE FROM top_header_translations WHERE top_header_id = ?', [id]);
    
    // Delete header
    const [result] = await connection.query('DELETE FROM top_header WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Top header announcement not found'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Top header announcement deleted successfully'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error deleting top header:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete top header announcement',
      error: error.message
    });
  } finally {
    connection.release();
  }
};


export const getlogo = async (req, res) =>{
   try {
    const query = `
      SELECT * FROM website_logo 
      ORDER BY created_at DESC
    `;
    
    const [logos] = await db.execute(query);
    
    res.json({
      success: true,
      data: logos
    });
  } catch (error) {
    console.error('Error fetching logos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logos',
      error: error.message
    });
  }
}

export const uploadLogo = async (req, res)=>{
  try {
    const { logo_url, website_title, logo_alt } = req.body;

    // Validation
    if (!logo_url || !website_title) {
      return res.status(400).json({
        success: false,
        message: 'Logo URL and website title are required'
      });
    }

    const query = `
      INSERT INTO website_logo (logo_url, website_title, logo_alt, created_at, updated_at) 
      VALUES (?, ?, ?, NOW(), NOW())
    `;
    
    const [result] = await db.execute(query, [logo_url, website_title, logo_alt || '']);
    
    // Fetch the created logo
    const [logos] = await db.execute('SELECT * FROM website_logo WHERE logo_id = ?', [result.insertId]);
    
    res.status(201).json({
      success: true,
      message: 'Logo created successfully',
      data: logos[0]
    });
  } catch (error) {
    console.error('Error creating logo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create logo',
      error: error.message
    });
  }
}

export const updateLogo = async (req, res) =>{
   try {
    const { id } = req.params;
    const { logo_url, website_title, logo_alt } = req.body;

    // Check if logo exists
    const [existingLogos] = await db.execute('SELECT * FROM website_logo WHERE logo_id = ?', [id]);
    
    if (existingLogos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Logo not found'
      });
    }

    // Validation
    if (!logo_url || !website_title) {
      return res.status(400).json({
        success: false,
        message: 'Logo URL and website title are required'
      });
    }

    const query = `
      UPDATE website_logo 
      SET logo_url = ?, website_title = ?, logo_alt = ?, updated_at = NOW() 
      WHERE logo_id = ?
    `;
    
    await db.execute(query, [logo_url, website_title, logo_alt || '', id]);
    
    // Fetch updated logo
    const [updatedLogos] = await db.execute('SELECT * FROM website_logo WHERE logo_id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Logo updated successfully',
      data: updatedLogos[0]
    });
  } catch (error) {
    console.error('Error updating logo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update logo',
      error: error.message
    });
  }
}

export const deleteLogo = async (req, res) =>{
  try {
    const { id } = req.params;

    // Check if logo exists
    const [existingLogos] = await db.execute('SELECT * FROM website_logo WHERE logo_id = ?', [id]);
    
    if (existingLogos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Logo not found'
      });
    }

    await db.execute('DELETE FROM website_logo WHERE logo_id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Logo deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting logo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete logo',
      error: error.message
    });
  }
}

export const setActiveLogo = async (req, res) =>{
  try {
    const { id } = req.params;

    // Check if logo exists
    const [existingLogos] = await db.execute('SELECT * FROM website_logo WHERE logo_id = ?', [id]);
    
    if (existingLogos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Logo not found'
      });
    }

    // First set all logos to inactive, then set the selected one to active
    await db.execute('UPDATE website_logo SET is_active = FALSE');
    await db.execute('UPDATE website_logo SET is_active = TRUE WHERE logo_id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Logo set as active successfully'
    });
  } catch (error) {
    console.error('Error setting active logo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set active logo',
      error: error.message
    });
  }
}
