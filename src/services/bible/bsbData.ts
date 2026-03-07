// This file will be auto-generated or loaded from assets
// For now, we'll load from the processed JSON file

export interface ProcessedVerse {
  b: string; // bookId
  c: number; // chapter
  v: number; // verse
  t: string; // text
  h?: string; // heading (optional)
}

export interface ProcessedBSB {
  translation: {
    id: string;
    name: string;
    totalVerses: number;
  };
  verses: ProcessedVerse[];
}

// We'll load this dynamically to avoid bundling issues
let cachedData: ProcessedBSB | null = null;

export async function loadBSBData(): Promise<ProcessedBSB> {
  if (cachedData) {
    return cachedData;
  }

  try {
    // In production, this would be bundled with the app
    // For now, we'll use require which works with Metro bundler
    const data = require('../../../data/bsb_processed.json') as ProcessedBSB;
    cachedData = data;
    return data;
  } catch (error) {
    console.error('Failed to load BSB data:', error);
    throw new Error('Bible data not available');
  }
}
