import * as CategoryModel from '../models/categoryModel.js';

// 🏷️ Get all categories
export const getCategories = async (req, res) => {
  try {
    const categories = await CategoryModel.getAllCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🏷️ Get single category
export const getCategory = async (req, res) => {
  try {
    const category = await CategoryModel.getCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🏷️ Create category
// 🏷️ Create category
export const createCategory = async (req, res) => {
  try {
    const { name, description, translations } = req.body; // translations = [{ language_id, name, description }]


    // 🧩 Validate main category data
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (name.length > 100)
      return res.status(400).json({ error: "Name must be 100 characters or less" });
    if (description && description.length > 500)
      return res.status(400).json({ error: "Description must be 500 characters or less" });

    // 🧩 Create base category (default English)
    const categoryId = await CategoryModel.createCategory({ name, description });

    // 🧩 If translations exist, save them in category_translations
    if (translations && Array.isArray(translations) && translations.length > 0) {
      await CategoryModel.addCategoryTranslations(categoryId, translations);
    }

    res.status(201).json({ message: "Category created successfully", category_id: categoryId });
  } catch (err) {
    console.error("❌ Error creating category:", err);
    res.status(500).json({ error: err.message });
  }
};


// 🏷️ Update category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;
    if (!name && !description && !is_active) {
      return res.status(400).json({ error: 'At least one field (name, description, or is_active) is required' });
    }
    if (name && name.trim() === '') {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    if (name && name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }
    if (description && description.length > 500) {
      return res.status(400).json({ error: 'Description must be 500 characters or less' });
    }
    if (is_active && !['active', 'inactive'].includes(is_active)) {
      return res.status(400).json({ error: 'Invalid status, must be "active" or "inactive"' });
    }
    const updatedCategory = await CategoryModel.updateCategory(parseInt(id), { name, description, is_active });
    res.status(200).json(updatedCategory);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update category' });
  }
};

// 🏷️ Delete category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await CategoryModel.deleteCategory(parseInt(id));
    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete category' });
  }
};