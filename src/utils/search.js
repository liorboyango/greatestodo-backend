/**
 * Search Utility Functions
 * Provides helper functions for full-text search on todo items.
 *
 * Note: Firestore does not natively support full-text search.
 * We implement in-memory search after fetching filtered results from Firestore.
 * For large datasets, consider integrating Algolia or Elasticsearch.
 */

/**
 * Normalizes a string for case-insensitive comparison.
 * Trims whitespace and converts to lowercase.
 *
 * @param {string} str - The string to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase();
}

/**
 * Checks if a string contains the search term (case-insensitive).
 *
 * @param {string} text - The text to search within
 * @param {string} term - The search term
 * @returns {boolean} True if text contains the term
 */
function containsTerm(text, term) {
  if (!text || !term) return false;
  return normalizeString(text).includes(normalizeString(term));
}

/**
 * Filters an array of todos based on a search term.
 * Searches across title, description, and category fields.
 *
 * @param {Array<Object>} todos - Array of todo objects to search
 * @param {string} searchTerm - The search term to match against
 * @returns {Array<Object>} Filtered todos that match the search term
 *
 * @example
 * const results = filterTodosBySearch(todos, 'meeting');
 * // Returns todos where title, description, or category contains 'meeting'
 */
function filterTodosBySearch(todos, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return todos;
  }

  const term = searchTerm.trim();

  return todos.filter((todo) => {
    return (
      containsTerm(todo.title, term) ||
      containsTerm(todo.description, term) ||
      containsTerm(todo.category, term)
    );
  });
}

/**
 * Determines which fields of a todo match the search term.
 *
 * @param {Object} todo - A todo object
 * @param {string} searchTerm - The search term
 * @returns {Array<string>} Array of field names that matched
 *
 * @example
 * const fields = getMatchedFields(todo, 'meeting');
 * // Returns ['title', 'description'] if both fields contain 'meeting'
 */
function getMatchedFields(todo, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') return [];

  const term = searchTerm.trim();
  const matchedFields = [];

  if (containsTerm(todo.title, term)) matchedFields.push('title');
  if (containsTerm(todo.description, term)) matchedFields.push('description');
  if (containsTerm(todo.category, term)) matchedFields.push('category');

  return matchedFields;
}

/**
 * Enriches todos with search metadata indicating which fields matched.
 *
 * @param {Array<Object>} todos - Array of todo objects
 * @param {string} searchTerm - The search term used
 * @returns {Array<Object>} Todos with _searchMeta field added
 *
 * @example
 * const enriched = enrichWithSearchMeta(todos, 'meeting');
 * // Each todo gets: _searchMeta: { matchedFields: ['title'], searchTerm: 'meeting' }
 */
function enrichWithSearchMeta(todos, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') return todos;

  return todos.map((todo) => ({
    ...todo,
    _searchMeta: {
      matchedFields: getMatchedFields(todo, searchTerm),
      searchTerm: searchTerm.trim(),
    },
  }));
}

/**
 * Sanitizes a search term to prevent injection attacks.
 * Removes special regex characters and limits length.
 *
 * @param {string} term - The raw search term from user input
 * @param {number} [maxLength=200] - Maximum allowed length
 * @returns {string} Sanitized search term
 */
function sanitizeSearchTerm(term, maxLength = 200) {
  if (!term || typeof term !== 'string') return '';

  // Trim whitespace
  let sanitized = term.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove null bytes and control characters
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  return sanitized;
}

module.exports = {
  normalizeString,
  containsTerm,
  filterTodosBySearch,
  getMatchedFields,
  enrichWithSearchMeta,
  sanitizeSearchTerm,
};
