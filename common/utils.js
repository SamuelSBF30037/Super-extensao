/**
 * Common utility functions for the extension
 */

/**
 * Checks if a DOM element exists
 * @param {string} selector - CSS selector to check
 * @returns {boolean} True if element exists
 */
function elementExists(selector) {
  return document.querySelector(selector) !== null;
}

/**
 * Creates a timeout promise
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats a date to a readable string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) date = new Date();
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Sanitizes text input removing extra spaces
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')  // Remove extra spaces
    .replace(/^\s+|\s+$/g, '')  // Trim start and end
    .replace(/\n\s*\n/g, '\n'); // Remove empty lines
}

/**
 * Validates if a string is a valid RG format
 * @param {string} rg - RG to validate
 * @returns {boolean} True if valid
 */
function isValidRG(rg) {
  if (!rg) return false;
  
  // Remove dots and commas
  const cleanRG = rg.replace(/[.,]/g, '');
  
  // Check if it's 5 digits
  return /^\d{5}$/.test(cleanRG);
}

/**
 * Extracts RGs from a text according to patterns
 * @param {string} text - Text to extract RGs from
 * @param {Array} patterns - Array of regex patterns to use
 * @returns {Array} Array of valid RGs
 */
function extractRGs(text, patterns) {
  if (!text || !patterns || !patterns.length) return [];
  
  // Create regex for RGs
  const rgRegexPattern = patterns.join('|');
  const rgRegex = new RegExp(rgRegexPattern, 'g');
  
  // Extract RGs using regex
  let rgMatches = text.match(rgRegex);
  
  if (!rgMatches) return [];
  
  // Process and validate RGs
  return rgMatches
    .map(rg => rg.replace(/[.,]/g, ''))
    .filter(rg => isValidRG(rg));
}

/**
 * Saves data to chrome.storage
 * @param {Object} data - Data to save
 * @returns {Promise} Promise that resolves when data is saved
 */
function saveToStorage(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      // Fallback to localStorage if chrome.storage is not available
      try {
        Object.keys(data).forEach(key => {
          localStorage.setItem(key, JSON.stringify(data[key]));
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    }
  });
}

/**
 * Loads data from chrome.storage
 * @param {Array|string} keys - Keys to load
 * @returns {Promise} Promise that resolves with loaded data
 */
function loadFromStorage(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      // Fallback to localStorage if chrome.storage is not available
      try {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            const item = localStorage.getItem(key);
            if (item) {
              try {
                result[key] = JSON.parse(item);
              } catch (e) {
                result[key] = item;
              }
            }
          });
        } else if (typeof keys === 'string') {
          const item = localStorage.getItem(keys);
          if (item) {
            try {
              result[keys] = JSON.parse(item);
            } catch (e) {
              result[keys] = item;
            }
          }
        }
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
  });
}

/**
 * Detects the current site from a URL
 * @param {string} url - URL to check
 * @returns {string} Site type (sei, sicad, or unknown)
 */
function detectSite(url) {
  if (!url) return 'unknown';
  
  if (url.includes('sei.go.gov.br')) {
    return 'sei';
  } else if (url.includes('sisp.ssp.go.gov.br')) {
    return 'sicad';
  } else {
    return 'unknown';
  }
}

/**
 * Generates a unique ID
 * @returns {string} Unique ID
 */
function generateUID() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Export the utilities for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    elementExists,
    delay,
    formatDate,
    sanitizeText,
    isValidRG,
    extractRGs,
    saveToStorage,
    loadFromStorage,
    detectSite,
    generateUID
  };
}