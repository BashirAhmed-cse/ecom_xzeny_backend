// controllers/productController.js
import * as ProductModel from '../models/productModel.js';
import fs from 'fs/promises';
import db from '../database.js';
import path from "path";
import Joi from "joi";

export const getProducts = async (req, res) => {
  try {
    const products = await ProductModel.getAllProductsWithDetails();
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
};

export const getProduct = async (req, res) => {
  try {
    const product = await ProductModel.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }
    
    // Return consistent format
    res.status(200).json({ success: true, data: product });

  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Failed to fetch product' 
    });
  }
};


function safeJSONParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}


// 🏷️ create Product
export const createProduct = async (req, res) => {
  console.log("🟢 createProduct input:", req.body, req.file);

  try {
    // 🔹 Validate input
    const schema = Joi.object({
      base_name: Joi.string().required(),
      sku: Joi.string().required(),
      handle: Joi.string().required(),
      category_id: Joi.number().integer().positive().required(),
      base_price: Joi.number().positive().required(),
      sale_price: Joi.number().positive().optional(),
      description: Joi.string().required(),
      themeColor: Joi.string().required(),
      themeName: Joi.string().required(),
      is_featured: Joi.string().valid("true", "false").required(),
      is_active: Joi.string().valid("true", "false").required(),
      seo_meta_title: Joi.string().required(),
      seo_meta_description: Joi.string().required(),
      seo_meta_keywords: Joi.string().optional().allow(""),
      sizes: Joi.string().optional().allow(""),
      colors: Joi.string().optional().allow(""),
      inventory: Joi.number().integer().min(0).required(),
      translations: Joi.string().optional().allow(""),
      size_variants_data: Joi.string().optional().allow(""),
      color_variants_data: Joi.string().optional().allow(""),
      faqs: Joi.string().optional().allow(""),
    });

    const { error } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    // 🔹 Destructure
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
      is_featured,
      is_active,
      seo_meta_title,
      seo_meta_description,
      seo_meta_keywords,
      sizes,
      colors,
      inventory,
      translations,
      size_variants_data,
      color_variants_data,
      faqs,
    } = req.body;

    // 🔹 Parse JSON safely
    const parsedData = {
      sizes: safeJSONParse(sizes) || [],
      colors: safeJSONParse(colors) || [],
      translations: safeJSONParse(translations) || [],
      size_variants_data: safeJSONParse(size_variants_data) || [],
      color_variants_data: safeJSONParse(color_variants_data) || [],
      faqs: safeJSONParse(faqs) || [],
      seo_meta_keywords: safeJSONParse(seo_meta_keywords) || [],
    };

    // 🔹 Validate total inventory (color + size)
    const totalVariantInventory =
      parsedData.color_variants_data.reduce(
        (sum, v) => sum + Number(v.inventory || 0),
        0
      ) +
      parsedData.size_variants_data.reduce(
        (sum, s) => sum + Number(s.inventory || 0),
        0
      );

    if (totalVariantInventory !== Number(inventory)) {
      return res.status(400).json({
        error: `Total inventory (${inventory}) does not match combined variant inventories (${totalVariantInventory})`,
      });
    }

    // 🔹 Organize uploaded files
    const productImages = (req.files || []).filter(
      (f) => f.fieldname === "productImages"
    );

    const colorImages = {};
    (req.files || []).forEach((f) => {
      const match = f.fieldname.match(/^colorImages\[(.+)\]$/);
      if (match) {
        const colorHex = match[1];
        if (!colorImages[colorHex]) colorImages[colorHex] = [];
        colorImages[colorHex].push({
          path: f.path,
          filename: f.filename,
          alt_text: `Product Image ${colorHex}`,
        });
      }
    });

    // 🔹 Build product data
    const productData = {
      base_name,
      sku,
      handle,
      category_id: Number(category_id),
      base_price: Number(base_price),
      sale_price: sale_price ? Number(sale_price) : null,
      description,
      themeColor,
      themeName,
      is_featured: is_featured === "true",
      is_active: is_active === "true",
      seo_meta_title,
      seo_meta_description,
      seo_meta_keywords: parsedData.seo_meta_keywords,
      translations: parsedData.translations,
      size_variants_data: parsedData.size_variants_data,
      color_variants_data: parsedData.color_variants_data,
      faqs: parsedData.faqs,
      inventory: Number(inventory),
      product_images: productImages.map((f) => ({
        path: f.path,
        filename: f.filename,
        alt_text: base_name,
      })),
      color_images: colorImages,
    };

    // 🔹 Save to DB
    const productId = await ProductModel.createFullProduct(productData, req.files);

    // 🔹 Sanitize response
    const sanitizedProduct = {
      ...productData,
      product_images: productData.product_images.map(
        (img) => `/uploads/${img.filename}`
      ),
      color_images: Object.fromEntries(
        Object.entries(productData.color_images).map(([hex, imgs]) => [
          hex,
          imgs.map((img) => `/uploads/${img.filename}`),
        ])
      ),
    };

    res.status(201).json({
      message: "✅ Product created successfully",
      productId,
      product: sanitizedProduct,
    });
  } catch (err) {
    console.error("❌ Error creating product:", err);

    // 🔹 Cleanup uploaded files on error
    const files = req.files || [];
    for (const file of files) {
      try {
        await fs.access(file.path);
        await fs.unlink(file.path);
      } catch {
        console.warn(`File not found for deletion: ${file.path}`);
      }
    }

    res.status(500).json({ error: err.message || "Failed to create product" });
  }
};
// 🏷️ Update Product — only update provided fields
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const data = req.body;
console.log('id:-',req.params);
console.log('data:-',data);
  try {
    const updatedProduct = await ProductModel.updateProductPartial(id, data);
    res.status(200).json({
      success: true,
      product: updatedProduct,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🏷️ Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

await ProductModel.deleteProduct(parseInt(id));
    res.status(200).json({ message: 'product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete category' });
  }
};

// frontend get product

export const frontendProductData = async (req, res) => {
  try {
    const productData = await ProductModel.getAllProductsImgFrontend();

    console.log('productData:-', productData); // ✅ log for debugging

    // Always return success, even if empty
    res.json({
      success: true,
      productData: productData || {},
    });
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch products",
    });
  }
};



// controllers/productController.js

// controllers/productController.js
export const frontendProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🎯 API Request for product ID:', id);
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid product ID is required',
        receivedId: id
      });
    }

    const productId = parseInt(id);
    const product = await ProductModel.getFrontendProductDetailsById(productId);
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found or inactive'
      });
    }

    // Calculate final price with proper fallbacks
    const calculateFinalPrice = (productData) => {
      // Use sale_price first, then base_price, with proper fallbacks
      let basePrice = 0;
      
      if (productData.sale_price && productData.sale_price !== '0.00') {
        basePrice = parseFloat(productData.sale_price);
      } else if (productData.base_price && productData.base_price !== '0.00') {
        basePrice = parseFloat(productData.base_price);
      }
      
      console.log('💰 Price calculation:', {
        base_price: productData.base_price,
        sale_price: productData.sale_price,
        calculated_base: basePrice
      });

      // Apply flash discount if available
      if (productData.flash_discounts && productData.flash_discounts.length > 0) {
        const discount = productData.flash_discounts[0];
        console.log('🎁 Applying discount:', discount);
        
        if (discount.percentage_discount) {
          basePrice = basePrice * (1 - discount.percentage_discount / 100);
        } else if (discount.fixed_discount) {
          basePrice = Math.max(0, basePrice - discount.fixed_discount);
        }
      }
      
      return basePrice;
    };

    const finalPrice = calculateFinalPrice(product);

    // Transform data for frontend with proper fallbacks
    const transformedProduct = {
      id: product.product_id,
      sku: product.sku,
      handle: product.handle,
      name: product.base_name || 'Unnamed Product',
      description: product.base_description || '',
      category: {
        id: product.category_id,
        name: product.category_name || 'Uncategorized',
        description: product.category_description || ''
      },
      pricing: {
        base_price: product.base_price ? parseFloat(product.base_price) : 0,
        sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
        final_price: finalPrice,
        currency: 'USD',
        has_discount: product.flash_discounts && product.flash_discounts.length > 0,
        discount_message: product.flash_discounts?.[0]?.message || null
      },
      theme: {
        color: product.theme_color || '#000000',
        name: product.theme_name || 'default'
      },
      media: {
        images: product.images || [],
        primary_image: product.images?.find(img => img.is_primary) || product.images?.[0] || null,
        variant_images: (product.images || []).reduce((acc, img) => {
          if (img.variant_id) {
            if (!acc[img.variant_id]) acc[img.variant_id] = [];
            acc[img.variant_id].push(img);
          }
          return acc;
        }, {})
      },
      variants: (product.variants || []).map(variant => ({
        id: variant.variant_id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        material: variant.material,
        stock: {
          quantity: variant.stock_quantity || 0,
          available: (product.inventory || [])
            .filter(inv => inv.variant_id === variant.variant_id)
            .reduce((sum, inv) => sum + (inv.available || 0), 0)
        },
        pricing: {
          modifier: variant.price_modifier ? parseFloat(variant.price_modifier) : 0,
          final_price: finalPrice + (variant.price_modifier ? parseFloat(variant.price_modifier) : 0)
        },
        swatch: variant.hex_code ? {
          hex_code: variant.hex_code,
          image_url: variant.swatch_image,
          label: variant.swatch_label
        } : null
      })),
      sizes: (product.sizes || []).map(size => ({
        id: size.size_id,
        label: size.size_lebel_text || size.size_label || 'Unknown',
        min_size: size.min_size,
        max_size: size.max_size,
        quantity: size.quantity || 0
      })),
      seo: product.seo || {},
      faqs: product.faqs || [],
      inventory_summary: {
        total_available: (product.variants || []).reduce((sum, variant) => {
          const variantInventory = (product.inventory || []).filter(inv => inv.variant_id === variant.variant_id);
          return sum + variantInventory.reduce((invSum, inv) => invSum + (inv.available || 0), 0);
        }, 0),
        low_stock: (product.variants || []).some(variant => {
          const variantInventory = (product.inventory || []).filter(inv => inv.variant_id === variant.variant_id);
          const available = variantInventory.reduce((sum, inv) => sum + (inv.available || 0), 0);
          return available > 0 && available <= 10;
        })
      },
      flash_discounts: (product.flash_discounts || []).map(fd => ({
  id: fd.flash_id,
  percentage: fd.percentage_discount ? parseFloat(fd.percentage_discount) : null,
  fixed: fd.fixed_discount ? parseFloat(fd.fixed_discount) : null,
  trigger_condition: fd.trigger_condition || 'on_page_load',
  duration_minutes: fd.duration_minutes || null,
  message: fd.message || '',
  start_date: fd.start_date,
  end_date: fd.end_date,
  is_active: fd.is_active === 1 || fd.is_active === 'Y'
})),

      metadata: {
        created_at: product.created_at,
        updated_at: product.updated_at,
        active: product.isactive === 'Y' || product.isactive === '1'
      }
    };

    console.log('✅ Successfully returning product:', transformedProduct.name);
    console.log('💰 Final pricing:', transformedProduct.pricing);
    
    res.status(200).json({ 
      success: true, 
      data: transformedProduct 
    });

  } catch (err) {
    console.error('💥 Error fetching product details:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Failed to fetch product details'
    });
  }
};