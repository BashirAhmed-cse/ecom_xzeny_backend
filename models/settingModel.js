import db from "../database.js";
// ✅ GET all default colors
export const getAllColors = async () => {
  const [rows] = await db.query(
    `SELECT  id, name, hex_value, CASE is_active WHEN 'Y' THEN 'active' WHEN 'N' THEN 'inactive' END AS is_active, created_at, updated_at FROM colors ORDER BY name`
  );
  return rows;
};

// ✅ ADD new color
export const createColor = async ({ name, hex_value }) => {
  const [result] = await db.query(
    `INSERT INTO colors (name, hex_value, is_active, created_at, updated_at)
     VALUES (?, ?, 'Y', NOW(), NOW())`,
    [name, hex_value || null]
  );
  return result.insertId;
};

// ✅ UPDATE color
export const updateColor = async (id, { name, hex_value, is_active }) => {
  const fields = [];
  const values = [];
  
  if (name) {
    fields.push("name = ?");
    values.push(name);
  }
  if (hex_value) {
    fields.push("hex_value = ?");
    values.push(hex_value);
  }
  if (is_active) {
    fields.push("is_active = ?");
    values.push(is_active === "active" ? "Y" : "N");
  }
  fields.push("updated_at = NOW()");
  
  if (fields.length === 1) {
    throw new Error("No fields to update");
  }

  const query = `UPDATE colors SET ${fields.join(", ")} WHERE id = ?`;
  values.push(id);
  
  const [result] = await db.query(query, values);
  if (result.affectedRows === 0) {
    throw new Error("Color not found");
  }
  
  const [updated] = await db.query(
    `SELECT  id, name, hex_value, CASE is_active WHEN 'Y' THEN 'active' WHEN 'N' THEN 'inactive' END AS is_active, created_at, updated_at FROM colors WHERE id = ?`,
    [id]
  );
  return updated[0];
};

// ✅ DELETE color
export const deleteColor = async (id) => {
  const [result] = await db.query(
    `DELETE FROM colors WHERE id = ?`,
    [id]
  );
  if (result.affectedRows === 0) {
    throw new Error("Color not found");
  }
};

// ✅ GET all default sizes
export const getAllSizes = async () => {
  const [rows] = await db.query(`
    SELECT 
      s.id AS size_id,
      s.name AS default_name,
      CASE s.is_active WHEN 'Y' THEN 'active' ELSE 'inactive' END AS is_active,
      s.created_at,
      s.updated_at,
      l.code AS lang_code,
      pst.label AS translated_label,
      pst.description AS translated_description
    FROM sizes s
    LEFT JOIN product_size_translations pst ON s.id = pst.size_tbl_id
    LEFT JOIN languages l ON pst.language_id = l.language_id
    ORDER BY s.name, l.code
  `);

  // 🧩 Group sizes by ID
  const sizesMap = {};

  for (const row of rows) {
    if (!sizesMap[row.size_id]) {
      sizesMap[row.size_id] = {
        id: row.size_id,
        name: row.default_name,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        translations: {},
      };
    }

    // Add translation if available
    if (row.lang_code) {
      sizesMap[row.size_id].translations[row.lang_code] = {
        label: row.translated_label,
        description: row.translated_description,
      };
    }
  }

  return Object.values(sizesMap);
};



// ✅ Create main size
export const createSize = async ({ name }) => {
  const [result] = await db.query(
    `INSERT INTO sizes (name, is_active, created_at, updated_at)
     VALUES (?, 'Y', NOW(), NOW())`,
    [name]
  );
  return result.insertId;
};

// ✅ Create translations for that size (using size_tbl_id)
export const createSizeTranslations = async (size_tbl_id, translations) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Get all language IDs
    const [langs] = await conn.query(`SELECT language_id, code FROM languages`);
    const langMap = Object.fromEntries(langs.map(l => [l.code, l.language_id]));

    const values = [];

    for (const [langCode, label] of Object.entries(translations)) {
      const language_id = langMap[langCode];
      if (!language_id) continue; // skip unknown languages

      // Map main size ID to size_tbl_id
      values.push([size_tbl_id, language_id, label, null]); // description is optional
    }

    if (values.length > 0) {
      await conn.query(
        `INSERT INTO product_size_translations (size_tbl_id, language_id, label, description)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    console.error("Error inserting translations:", error);
    throw error;
  } finally {
    conn.release();
  }
};

// ✅ UPDATE size
export const updateSize = async (id, { name, is_active }) => {
  const fields = [];
  const values = [];
  
  if (name) {
    fields.push("name = ?");
    values.push(name);
  }
  if (is_active) {
    fields.push("is_active = ?");
    values.push(is_active === "active" ? "Y" : "N");
  }
  fields.push("updated_at = NOW()");
  
  if (fields.length === 1) {
    throw new Error("No fields to update");
  }

  const query = `UPDATE sizes SET ${fields.join(", ")} WHERE id = ?`;
  values.push(id);
  
  const [result] = await db.query(query, values);
  if (result.affectedRows === 0) {
    throw new Error("Size not found");
  }
  
  const [updated] = await db.query(
    `SELECT id, name, CASE is_active WHEN 'Y' THEN 'active' WHEN 'N' THEN 'inactive' END AS is_active, created_at, updated_at FROM sizes WHERE id = ?`,
    [id]
  );
  return updated[0];
};

// ✅ DELETE size
export const deleteSize = async (id) => {
  const [result] = await db.query(
    `DELETE FROM sizes WHERE id = ?`,
    [id]
  );
  if (result.affectedRows === 0) {
    throw new Error("Size not found");
  }
};
// 🟢 Create or Update Page
export const createOrUpdatePage = async ({ slug, pageId, title, content, meta_title, meta_description, translations }) => {
  try {
    // Validate required fields
    if (!slug || !title || !content) {
      throw new Error("Missing required fields: slug, title, and content are required");
    }

    // Ensure all required fields have values
    const safeSlug = (slug || '').trim();
    const safeTitle = (title || '').trim();
    const safeContent = (content || '').trim();
    const safeMetaTitle = (meta_title || '').trim();
    const safeMetaDescription = (meta_description || '').trim();

    if (!safeSlug) {
      throw new Error("Slug is required");
    }
    if (!safeTitle) {
      throw new Error("Title is required");
    }
    if (!safeContent) {
      throw new Error("Content is required");
    }

   

    let actualPageId = pageId;
    let isUpdate = false;

    if (pageId) {
      // Update existing page by ID
      const [existingPages] = await db.query("SELECT id FROM pages WHERE id = ?", [pageId]);
      
      if (existingPages.length > 0) {
        isUpdate = true;
        actualPageId = existingPages[0].id;
        
        // Check if new slug already exists for another page
        if (safeSlug) {
          const [slugConflict] = await db.query(
            "SELECT id FROM pages WHERE slug = ? AND id != ?", 
            [safeSlug, actualPageId]
          );
          
          if (slugConflict.length > 0) {
            throw new Error("Slug already exists for another page");
          }
        }
        
        await db.query(
          "UPDATE pages SET slug = ?, title = ?, content = ?, meta_title = ?, meta_description = ?, updated_at = NOW() WHERE id = ?",
          [safeSlug, safeTitle, safeContent, safeMetaTitle, safeMetaDescription, actualPageId]
        );

        // Clear old translations
        await db.query("DELETE FROM page_translations WHERE page_id = ?", [actualPageId]);
      } else {
        throw new Error("Page not found for the provided ID");
      }
    } else {
      // Create new page - check if slug already exists
      const [existingPages] = await db.query("SELECT id FROM pages WHERE slug = ?", [safeSlug]);
      
      if (existingPages.length > 0) {
        // Update existing page by slug
        isUpdate = true;
        actualPageId = existingPages[0].id;
        
        await db.query(
          "UPDATE pages SET title = ?, content = ?, meta_title = ?, meta_description = ?, updated_at = NOW() WHERE slug = ?",
          [safeTitle, safeContent, safeMetaTitle, safeMetaDescription, safeSlug]
        );

        // Clear old translations
        await db.query("DELETE FROM page_translations WHERE page_id = ?", [actualPageId]);
      } else {
        // Create new page
       
        
        const [result] = await db.query(
          "INSERT INTO pages (slug, title, content, meta_title, meta_description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())",
          [safeSlug, safeTitle, safeContent, safeMetaTitle, safeMetaDescription]
        );
        actualPageId = result.insertId;
  
      }
    }

    // Handle translations
    if (translations && translations.length > 0) {
   
      
      for (const t of translations) {
        const { language_id, language_code, title: transTitle, content: transContent } = t;

        const safeTransTitle = (transTitle || '').trim();
        const safeTransContent = (transContent || '').trim();

        if (safeTransTitle || safeTransContent) {
          await db.query(
            "INSERT INTO page_translations (page_id, language_id, title, content) VALUES (?, ?, ?, ?)",
            [actualPageId, language_id, safeTransTitle, safeTransContent]
          );
        }
      }

    }

    return {
      success: true,
      message: isUpdate ? "Page updated successfully" : "Page created successfully",
      pageId: actualPageId,
    };
  } catch (err) {
    console.error("Error in PageModel.createOrUpdatePage:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      sql: err.sql
    });
    throw err;
  }
};

// 🟢 Get page by slug
export const getPageBySlug = async (slug) => {
  const [rows] = await db.query("SELECT * FROM pages WHERE slug = ?", [slug]);
  return rows[0] || null;
};
