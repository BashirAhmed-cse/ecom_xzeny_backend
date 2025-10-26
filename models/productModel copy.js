import db from "../database.js";
import fs from "fs/promises";


export const getAllProductsWithDetails = async () => {
  const conn = await db.getConnection();

  try {
    // 🔹 Base product + SEO + Category
    const [products] = await conn.query(`
      SELECT 
        p.*,
        c.name AS category_name,
        ps.meta_title,
        ps.meta_description,
        ps.meta_keywords
      FROM products p
      LEFT JOIN categories c ON c.category_id = p.category_id
      LEFT JOIN product_seo ps ON ps.product_id = p.product_id
      ORDER BY p.product_id DESC
    `);

    if (!products.length) return [];

    const productIds = products.map((p) => p.product_id);

    // 🔹 Translations
    const [translations] = await conn.query(
      `SELECT * FROM product_translations WHERE product_id IN (?)`,
      [productIds]
    );

    // 🔹 Sizes + Translations
    const [sizes] = await conn.query(
      `SELECT * FROM product_sizes WHERE product_id IN (?)`,
      [productIds]
    );
    const sizeIds = sizes.map((s) => s.size_id);
    const [sizeTranslations] = sizeIds.length
      ? await conn.query(
          `SELECT * FROM product_size_translations WHERE size_id IN (?)`,
          [sizeIds]
        )
      : [[]];

    // 🔹 Variants + Swatches + Inventory
    const [variants] = await conn.query(`
      SELECT 
        pv.*,
        cs.hex_code,
        cs.image_url,
        cs.label AS swatch_label,
        il.on_hand,
        il.reserved
      FROM product_variants pv
      LEFT JOIN color_swatches cs ON cs.variant_id = pv.variant_id
      LEFT JOIN inventory_levels il ON il.variant_id = pv.variant_id
      WHERE pv.product_id IN (?)
    `, [productIds]);

    // 🔹 Product Images
    const [images] = await conn.query(
      `SELECT * FROM product_images WHERE product_id IN (?)`,
      [productIds]
    );

    // 🔹 FAQs + Translations
    const [faqs] = await conn.query(
      `SELECT * FROM product_faqs WHERE product_id IN (?)`,
      [productIds]
    );
    const faqIds = faqs.map((f) => f.faq_id);
    const [faqTranslations] = faqIds.length
      ? await conn.query(
          `SELECT * FROM product_faq_translations WHERE faq_id IN (?)`,
          [faqIds]
        )
      : [[]];

    // 🔹 Group everything
    const productMap = {};
    for (const p of products) {
      productMap[p.product_id] = {
        ...p,
        category: { id: p.category_id, name: p.category_name },
        seo: {
          title: p.meta_title,
          description: p.meta_description,
          keywords: p.meta_keywords,
        },
        translations: [],
        sizes: [],
        variants: [],
        images: [],
        faqs: [],
      };
    }

    // Group translations
    for (const tr of translations) {
      productMap[tr.product_id]?.translations.push(tr);
    }

    // Group sizes + size translations
    const sizeMap = {};
    for (const s of sizes) {
      sizeMap[s.size_id] = {
        ...s,
        translations: [],
      };
      productMap[s.product_id]?.sizes.push(sizeMap[s.size_id]);
    }

    for (const st of sizeTranslations) {
      sizeMap[st.size_id]?.translations.push(st);
    }

    // Group variants
    for (const v of variants) {
      productMap[v.product_id]?.variants.push({
        variant_id: v.variant_id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        material: v.material,
        stock_quantity: v.stock_quantity,
        price_modifier: v.price_modifier,
        swatch: {
          hex_code: v.hex_code,
          image_url: v.image_url,
          label: v.swatch_label,
        },
        inventory: {
          on_hand: v.on_hand,
          reserved: v.reserved,
        },
      });
    }

    // Group images
    for (const img of images) {
      productMap[img.product_id]?.images.push(img);
    }

    // Group FAQs + translations
    const faqMap = {};
    for (const f of faqs) {
      faqMap[f.faq_id] = { ...f, translations: [] };
      productMap[f.product_id]?.faqs.push(faqMap[f.faq_id]);
    }

    for (const ft of faqTranslations) {
      faqMap[ft.faq_id]?.translations.push(ft);
    }

    return Object.values(productMap);
  } finally {
    conn.release();
  }
};


export const getAllProducts = async () => {
  const conn = await db.getConnection();

  try {
    const [products] = await conn.query(`
      SELECT 
        p.product_id,
        p.base_name,
        p.sku,
        p.handle,
        p.base_description,
        p.base_price,
        p.sale_price,
        p.theme_color,
        p.theme_name,
        p.isactive,
        p.created_at,
        p.updated_at,
        ps.meta_title,
        ps.meta_description,
        ps.meta_keywords
      FROM products p
      LEFT JOIN product_seo ps ON ps.product_id = p.product_id
      ORDER BY p.product_id DESC
    `);

    if (!products.length) return [];

    const productIds = products.map((p) => p.product_id);

    // 🔹 Variants + Swatches + Inventory
    const [variants] = await conn.query(`
      SELECT 
        pv.variant_id,
        pv.product_id,
        pv.sku,
        pv.color,
        pv.size,
        pv.stock_quantity,
        pv.price_modifier,
        pv.material,
        pv.swatch_id,
        cs.hex_code AS swatch_hex,
        cs.image_url AS swatch_image,
        cs.label AS swatch_label
      FROM product_variants pv
      LEFT JOIN color_swatches cs ON cs.variant_id = pv.variant_id
      WHERE pv.product_id IN (?)
      ORDER BY pv.variant_id
    `, [productIds]);

    // 🔹 Product Images
    const [images] = await conn.query(`
      SELECT product_id, image_url, is_primary, alt_text
      FROM product_images
      WHERE product_id IN (?)
    `, [productIds]);

    // 🔹 Organize products
    const productMap = {};
    products.forEach(p => {
      productMap[p.product_id] = {
        ...p,
        images: { main: [], colors: {} },
        variants: []
      };
    });

    // Assign images
    images.forEach(img => {
      if (img.is_primary) productMap[img.product_id].images.main.push(img.image_url);
      else {
        // assign to color if color info exists in alt_text
        const colorKey = img.alt_text || 'main';
        if (!productMap[img.product_id].images.colors[colorKey])
          productMap[img.product_id].images.colors[colorKey] = [];
        productMap[img.product_id].images.colors[colorKey].push(img.image_url);
      }
    });

    // Assign variants with swatch info
    variants.forEach(v => {
      productMap[v.product_id].variants.push({
        variant_id: v.variant_id,
        sku: v.sku,
        color: v.swatch_id ? {
          id: v.swatch_id,
          hex: v.swatch_hex,
          label: v.swatch_label,
          image: v.swatch_image
        } : null,
        size: v.size,
        stock_quantity: v.stock_quantity,
        price_modifier: v.price_modifier,
        material: v.material
      });
    });

    return Object.values(productMap);

  } finally {
    conn.release();
  }
};

export const createFullProduct = async (productData, files = []) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const {
      base_name,
      sku,
      handle,
      category_id,
      base_price,
      sale_price,
      description,
      themeColor,
      themeName,
      is_active,
      translations = [],
      size_variants_data = [],
      color_variants_data = [],
      faqs = [],
      product_images = [],
      color_images = {},
      seo_meta_title,
      seo_meta_description,
      seo_meta_keywords,
    } = productData;

    // 🔹 Helper: safely parse JSON fields
    const parseSafe = (value) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return Array.isArray(value) ? value : [];
    };

    const jsonData = {
      translations: parseSafe(translations),
      size_variants_data: parseSafe(size_variants_data),
      color_variants_data: parseSafe(color_variants_data),
      faqs: parseSafe(faqs),
    };

    // 🔹 Get active languages
    const [languages] = await conn.query(
      `SELECT language_id, code FROM languages WHERE is_active = 1`
    );
    const langMap = {};
    languages.forEach((l) => (langMap[l.code] = l.language_id));

    // 🔹 Insert main product
    const [productResult] = await conn.query(
      `INSERT INTO products 
        (category_id, sku, handle, base_name, base_description, base_price, sale_price, theme_color, theme_name, isactive, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        category_id,
        sku,
        handle,
        base_name,
        description,
        base_price,
        sale_price || null,
        themeColor,
        themeName,
        is_active ? "Y" : "N",
      ]
    );

    const product_id = productResult.insertId;

    // 🔹 Insert SEO
    const seoKeywordsString = Array.isArray(seo_meta_keywords)
      ? seo_meta_keywords.join(", ")
      : seo_meta_keywords || "";

    await conn.query(
      `INSERT INTO product_seo 
        (product_id, meta_title, meta_description, meta_keywords, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [product_id, seo_meta_title || "", seo_meta_description || "", seoKeywordsString]
    );

    // 🔹 Insert translations
    for (const tr of jsonData.translations) {
      const langId = tr.language_id || langMap[tr.code];
      if (!langId) continue;
      await conn.query(
        `INSERT INTO product_translations 
          (product_id, language_id, name, description, meta_title, meta_description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [product_id, langId, tr.name, tr.description, tr.meta_title || null, tr.meta_description || null]
      );
    }

    // 🔹 Insert sizes + translations
    const sizeIdMap = {};
    for (const s of jsonData.size_variants_data) {
      const [sizeResult] = await conn.query(
        `INSERT INTO product_sizes
          (product_id, size_tbl_id, size_lebel_text, quantity,is_active, created_at, updated_at)
         VALUES (?, ?, ?,?, 'Y', NOW(), NOW())`,
        [product_id, s.size_id, s.size_name,s.inventory]
      );

      const size_id = sizeResult.insertId;
      sizeIdMap[s.size_id] = size_id;

      if (s.translations) {
        for (const [langKey, val] of Object.entries(s.translations)) {
          const langId = langMap[langKey] || 1;
          await conn.query(
            `INSERT INTO product_size_translations (size_id, language_id, label, description)
             VALUES (?, ?, ?, ?)`,
            [size_id, langId, val.name, val.description || ""]
          );
        }
      }
    }

    // 🔹 Handle color variants + swatches
    for (const colorVariant of jsonData.color_variants_data) {
      const [variantResult] = await conn.query(
        `INSERT INTO product_variants 
          (product_id, sku, color, size, stock_quantity, price_modifier, material)
         VALUES (?, ?, ?, ?, ?, ?,  ?)`,
        [
          product_id,
          `${sku}-${colorVariant.sku_suffix || colorVariant.color_name || ""}`,
          colorVariant.color_name || null,
          colorVariant.size_name || null,
          colorVariant.inventory || 0,
          colorVariant.price_modifier || 0.0,
          colorVariant.material || null,
       
        ]
      );

      const variant_id = variantResult.insertId;
// 🔹 Insert initial inventory record
  await conn.query(
    `INSERT INTO inventory_levels (variant_id, location_id, on_hand, reserved)
     VALUES (?, ?, ?, ?)`,
    [
      variant_id,
      0, // default location_id, you can change if multiple locations exist
      colorVariant.inventory || 0,
      0, // initial reserved quantity
    ]
  );
      // 🔹 Determine swatch image
      let image_url = null;
      if (color_images && color_images[colorVariant.color_hex]) {
        image_url = `/uploads/${color_images[colorVariant.color_hex].filename}`;
      } else {
        const hexKey = colorVariant.color_hex?.replace("#", "");
        const fileKey = `colorImages[${hexKey}]`;
        const colorFile = files.find((f) => f.fieldname === fileKey);
        if (colorFile) image_url = `/uploads/${colorFile.filename}`;
      }

      // 🔹 Insert color swatch
      const [swatchResult] = await conn.query(
        `INSERT INTO color_swatches (variant_id, hex_code, image_url, label)
         VALUES (?, ?, ?, ?)`,
        [variant_id, colorVariant.color_hex || null, image_url, colorVariant.color_name || null]
      );

      const swatch_id = swatchResult.insertId;

      // 🔹 Link variant to swatch
      await conn.query(
        `UPDATE product_variants SET swatch_id = ? WHERE variant_id = ?`,
        [swatch_id, variant_id]
      );
    }

    // 🔹 Insert product images
    for (const [i, img] of product_images.entries()) {
      await conn.query(
        `INSERT INTO product_images (product_id, variant_id, image_url, alt_text, is_primary)
         VALUES (?, NULL, ?, ?, ?)`,
        [product_id, `/uploads/${img.filename}`, img.alt_text, i === 0 ? 1 : 0]
      );
    }

    // 🔹 Insert FAQs
    for (const f of jsonData.faqs) {
      const [faqResult] = await conn.query(
        `INSERT INTO product_faqs (product_id, question_key, question, ques_ans, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
        [product_id, f.id, f.question, f.answer]
      );

      const faq_id = faqResult.insertId;

      for (const [langKey, tr] of Object.entries(f.translations || {})) {
        const langId = langMap[langKey] || 1;
        await conn.query(
          `INSERT INTO product_faq_translations (faq_id, language_id, question, answer)
           VALUES (?, ?, ?, ?)`,
          [faq_id, langId, tr.question, tr.answer]
        );
      }
    }

    await conn.commit();
    return product_id;
  } catch (err) {
    await conn.rollback();

    // Delete uploaded files on rollback
    for (const file of files) {
      try {
        await fs.access(file.path);
        await fs.unlink(file.path);
      } catch {
        console.warn(`File not found for deletion: ${file.path}`);
      }
    }

    throw err;
  } finally {
    conn.release();
  }
};

export const updateProductPartial = async (id, data, files = []) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1️⃣ Update main product fields
    const allowedFields = [
      "base_name",
      "base_description",
      "base_price",
      "sale_price",
      "theme_color",
      "theme_name",
      "category_id",
      "isactive",
    ];

    const setClauses = [];
    const values = [];

    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(data[key]);
      }
    }

    if (setClauses.length > 0) {
      const sql = `UPDATE products SET ${setClauses.join(", ")}, updated_at = NOW() WHERE product_id = ?`;
      values.push(id);
      await conn.query(sql, values);
    }

    // 2️⃣ Update SEO
// 2️⃣ Update SEO
if (data.seo) {
  const seoTitle = data.seo.title || "";
  const seoDescription = data.seo.description || "";
  const seoKeywords = data.seo.keywords || "";

  await conn.query(
    `UPDATE product_seo 
     SET meta_title = ?, meta_description = ?, meta_keywords = ?, updated_at = NOW() 
     WHERE product_id = ?`,
    [seoTitle, seoDescription, seoKeywords, id]
  );
}


    // 3️⃣ Update variants
    if (data.variants?.length) {
      for (const variant of data.variants) {
        const variantFields = [];
        const variantValues = [];

        ["color", "size", "material", "stock_quantity", "price_modifier"].forEach((key) => {
          if (variant[key] !== undefined) {
            variantFields.push(`${key} = ?`);
            variantValues.push(variant[key]);
          }
        });

        if (variantFields.length > 0) {
          variantValues.push(variant.variant_id, id);
          const sql = `UPDATE product_variants SET ${variantFields.join(", ")} WHERE variant_id = ? AND product_id = ?`;
          await conn.query(sql, variantValues);
        }

        // Update inventory if stock_quantity exists
        if (variant.stock_quantity !== undefined) {
          await conn.query(
            `UPDATE inventory_levels SET on_hand = ? WHERE variant_id = ?`,
            [variant.stock_quantity, variant.variant_id]
          );
        }

        // Update color swatch if new image or hex
        if (variant.color_hex || variant.color_image) {
          const image_url = variant.color_image
            ? `/uploads/${variant.color_image.filename}`
            : null;
          await conn.query(
            `UPDATE color_swatches SET hex_code = ?, image_url = ?, label = ? WHERE variant_id = ?`,
            [variant.color_hex || null, image_url, variant.color_name || null, variant.variant_id]
          );
        }
      }
    }

    // 4️⃣ Update sizes
    if (data.sizes?.length) {
      for (const size of data.sizes) {
        const sizeFields = [];
        const sizeValues = [];

        ["size_lebel_text", "quantity", "is_active"].forEach((key) => {
          if (size[key] !== undefined) {
            sizeFields.push(`${key} = ?`);
            sizeValues.push(size[key]);
          }
        });

        if (sizeFields.length > 0) {
          sizeValues.push(size.size_id, id);
          const sql = `UPDATE product_sizes SET ${sizeFields.join(", ")} WHERE size_id = ? AND product_id = ?`;
          await conn.query(sql, sizeValues);
        }
      }
    }

    // 5️⃣ Update product images
    if (files.length) {
      for (const img of files) {
        const altText = img.alt_text || "";
        await conn.query(
          `INSERT INTO product_images (product_id, variant_id, image_url, alt_text, is_primary, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 0, NOW(), NOW())
           ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), alt_text = VALUES(alt_text), updated_at = NOW()`,
          [id, `/uploads/${img.filename}`, altText]
        );
      }
    }

    await conn.commit();

    // 6️⃣ Return updated product
    const [rows] = await conn.query("SELECT * FROM products WHERE product_id = ?", [id]);
    return rows[0];
  } catch (err) {
    await conn.rollback();
    for (const file of files) {
      try {
        await fs.access(file.path);
        await fs.unlink(file.path);
      } catch {}
    }
    throw err;
  } finally {
    conn.release();
  }
};


// 🏷️ Delete product

export const deleteProduct = async (id) => {
  const [result] = await db.query('DELETE FROM products WHERE product_id = ?', [id]);
  if (result.affectedRows === 0) {
    throw new Error('product not found');
  }
};

export const getProductById = async(id) =>{
const [rows] = await db.execute(
      'SELECT * FROM products WHERE product_id = ?', 
      [id]
    );
    return rows[0] || null;
}

// frontend product data

export const getAllProductsImgFrontend = async () => {
  const conn = await db.getConnection();
  try {
    const [products] = await conn.query(`
      SELECT 
        p.product_id,
        p.base_name AS name,
        p.base_price,
        p.sale_price,
        p.theme_name,
        p.theme_color,
        p.created_at,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.category_id = p.category_id
      WHERE p.isactive = 'Y'
      ORDER BY p.product_id DESC
    `);

    if (!products.length) return {};

    const productIds = products.map(p => p.product_id);

    const [images] = await conn.query(
      `SELECT product_id, image_url, alt_text, is_primary
       FROM product_images
       WHERE product_id IN (?)`,
      [productIds]
    );

    // Map images by product_id
    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.product_id]) imageMap[img.product_id] = [];
      imageMap[img.product_id].push({
        url: img.image_url,
        alt: img.alt_text,
        is_primary: !!img.is_primary,
      });
    });

    const productMap = {};
    products.forEach(p => {
      const colorKey = p.theme_name ? p.theme_name.toLowerCase().trim() : `product_${p.product_id}`;
       // Get all images for this product
  const imgs = imageMap[p.product_id] || [];
  const sortedImages = imgs
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)) // primary = true first
    .map(img => img.url);
      productMap[colorKey] = {
        name: p.name,
        base_price: p.base_price,
        sale_price: p.sale_price,
        theme_name: p.theme_name,
        colorWay: p.theme_name ? `${p.theme_name}-${p.theme_color}` : p.theme_color || '',
        releaseDate: new Date(p.created_at || Date.now()).toISOString().split("T")[0],
        images: sortedImages,
        category: p.category_name,
      };
    });

    return productMap;
  } finally {
    conn.release();
  }
};




// models/ProductModel.js - Debug Version
export const getFrontendProductDetailsById = async (id) => {
  try {
    console.log('🔍 Searching for product ID:', id);
    
    // First, check if product exists at all
    const productCheckQuery = `
      SELECT product_id, base_name, isactive 
      FROM products 
      WHERE product_id = ?
    `;
    
    const [productCheck] = await db.execute(productCheckQuery, [id]);
    console.log('📦 Product check result:', productCheck);
    
    if (productCheck.length === 0) {
      console.log('❌ Product not found in database');
      return null;
    }
    
    const product = productCheck[0];
    console.log('📋 Product found:', {
      id: product.product_id,
      name: product.base_name,
      isactive: product.isactive
    });
    
    if (product.isactive !== 'Y') {
      console.log('🚫 Product is inactive');
      return null;
    }

    // Now get full details using separate queries (more reliable)
    console.log('🔄 Fetching product details...');
    
    const [
      variantsResult,
      sizesResult,
      imagesResult,
      seoResult,
      faqsResult,
      inventoryResult,
      flashDiscountsResult,
      categoryResult
    ] = await Promise.all([
      // Variants
      db.execute(`
        SELECT pv.*, cs.hex_code, cs.image_url as swatch_image, cs.label as swatch_label
        FROM product_variants pv
        LEFT JOIN color_swatches cs ON pv.swatch_id = cs.swatch_id
        WHERE pv.product_id = ?
      `, [id]),
      
      // Sizes
      db.execute(`
        SELECT * FROM product_sizes 
        WHERE product_id = ? AND is_active = 'Y'
      `, [id]),
      
      // Images
      db.execute(`
        SELECT * FROM product_images 
        WHERE product_id = ?
        ORDER BY is_primary DESC, image_id ASC
      `, [id]),
      
      // SEO
      db.execute(`SELECT * FROM product_seo WHERE product_id = ?`, [id]),
      
      // FAQs
      db.execute(`SELECT * FROM product_faqs WHERE product_id = ? AND is_active = 1`, [id]),
      
      // Inventory
      db.execute(`
        SELECT il.*, pv.variant_id
        FROM inventory_levels il
        INNER JOIN product_variants pv ON il.variant_id = pv.variant_id
        WHERE pv.product_id = ?
      `, [id]),
      
      // Flash discounts
      db.execute(`
        SELECT * FROM flash_discounts 
        WHERE product_id = ? 
          AND is_active = 1
          AND NOW() BETWEEN start_date AND COALESCE(end_date, '9999-12-31')
      `, [id]),
      
      // Category
      db.execute(`
        SELECT c.* 
        FROM categories c
        INNER JOIN products p ON c.category_id = p.category_id
        WHERE p.product_id = ?
      `, [id])
    ]);

    console.log('📊 Query results:', {
      variants: variantsResult[0]?.length || 0,
      sizes: sizesResult[0]?.length || 0,
      images: imagesResult[0]?.length || 0,
      seo: seoResult[0]?.length || 0,
      faqs: faqsResult[0]?.length || 0,
      inventory: inventoryResult[0]?.length || 0,
      flashDiscounts: flashDiscountsResult[0]?.length || 0,
      category: categoryResult[0]?.length || 0
    });

    // Build the complete product object
    const completeProduct = {
      ...productCheck[0],
      category: categoryResult[0]?.[0] || {},
      variants: variantsResult[0] || [],
      sizes: sizesResult[0] || [],
      images: imagesResult[0] || [],
      seo: seoResult[0]?.[0] || {},
      faqs: faqsResult[0] || [],
      inventory: inventoryResult[0] || [],
      flash_discounts: flashDiscountsResult[0] || []
    };

    console.log('✅ Final product object built');
    return completeProduct;

  } catch (error) {
    console.error('❌ Error in getFrontendProductDetailsById:', error);
    throw error;
  }
};