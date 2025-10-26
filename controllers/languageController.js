import * as languageModel from '../models/LanguageModel.js';

// 🏷️ Get all languages
export const getLanguages = async (req, res) => {
  try {
    const languages = await languageModel.getAllLanguage();
    res.json(languages);
  } catch (err) {
    console.error('Error fetching languages:', err);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
};
