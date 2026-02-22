/**
 * Search Functionality Tests
 * Unit tests for the search utility functions and search behavior.
 *
 * Run with: npm test
 */

const {
  normalizeString,
  containsTerm,
  filterTodosBySearch,
  getMatchedFields,
  enrichWithSearchMeta,
  sanitizeSearchTerm,
} = require('../utils/search');

// Sample todo data for testing
const sampleTodos = [
  {
    id: '1',
    title: 'Buy groceries',
    description: 'Milk, eggs, bread',
    category: 'Shopping',
    status: 'pending',
    priority: 'low',
  },
  {
    id: '2',
    title: 'Team meeting',
    description: 'Weekly sync with the engineering team',
    category: 'Work',
    status: 'pending',
    priority: 'high',
  },
  {
    id: '3',
    title: 'Read book',
    description: 'Finish reading Clean Code',
    category: 'Personal',
    status: 'completed',
    priority: 'medium',
  },
  {
    id: '4',
    title: 'Doctor appointment',
    description: 'Annual checkup at the clinic',
    category: 'Health',
    status: 'pending',
    priority: 'high',
  },
  {
    id: '5',
    title: 'Fix bug in production',
    description: 'Critical bug affecting team performance',
    category: 'Work',
    status: 'pending',
    priority: 'high',
  },
];

describe('normalizeString', () => {
  test('converts to lowercase', () => {
    expect(normalizeString('HELLO')).toBe('hello');
  });

  test('trims whitespace', () => {
    expect(normalizeString('  hello  ')).toBe('hello');
  });

  test('handles empty string', () => {
    expect(normalizeString('')).toBe('');
  });

  test('handles null/undefined', () => {
    expect(normalizeString(null)).toBe('');
    expect(normalizeString(undefined)).toBe('');
  });

  test('handles non-string input', () => {
    expect(normalizeString(123)).toBe('');
  });
});

describe('containsTerm', () => {
  test('returns true when text contains term (case-insensitive)', () => {
    expect(containsTerm('Hello World', 'world')).toBe(true);
    expect(containsTerm('Hello World', 'WORLD')).toBe(true);
    expect(containsTerm('Hello World', 'Hello')).toBe(true);
  });

  test('returns false when text does not contain term', () => {
    expect(containsTerm('Hello World', 'foo')).toBe(false);
  });

  test('returns false for empty inputs', () => {
    expect(containsTerm('', 'term')).toBe(false);
    expect(containsTerm('text', '')).toBe(false);
    expect(containsTerm(null, 'term')).toBe(false);
    expect(containsTerm('text', null)).toBe(false);
  });

  test('handles partial matches', () => {
    expect(containsTerm('meeting tomorrow', 'meet')).toBe(true);
    expect(containsTerm('meeting tomorrow', 'morrow')).toBe(true);
  });
});

describe('filterTodosBySearch', () => {
  test('filters by title match', () => {
    const results = filterTodosBySearch(sampleTodos, 'meeting');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
  });

  test('filters by description match', () => {
    const results = filterTodosBySearch(sampleTodos, 'Clean Code');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('3');
  });

  test('filters by category match', () => {
    const results = filterTodosBySearch(sampleTodos, 'Work');
    expect(results).toHaveLength(2);
    expect(results.map((t) => t.id)).toEqual(expect.arrayContaining(['2', '5']));
  });

  test('is case-insensitive', () => {
    const results = filterTodosBySearch(sampleTodos, 'GROCERIES');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  test('returns all todos when search term is empty', () => {
    const results = filterTodosBySearch(sampleTodos, '');
    expect(results).toHaveLength(sampleTodos.length);
  });

  test('returns all todos when search term is null', () => {
    const results = filterTodosBySearch(sampleTodos, null);
    expect(results).toHaveLength(sampleTodos.length);
  });

  test('returns empty array when no matches', () => {
    const results = filterTodosBySearch(sampleTodos, 'xyznonexistent');
    expect(results).toHaveLength(0);
  });

  test('matches across multiple fields', () => {
    // 'team' appears in todo 2 title and todo 5 description
    const results = filterTodosBySearch(sampleTodos, 'team');
    expect(results).toHaveLength(2);
    expect(results.map((t) => t.id)).toEqual(expect.arrayContaining(['2', '5']));
  });

  test('handles partial word matches', () => {
    const results = filterTodosBySearch(sampleTodos, 'appoint');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('4');
  });
});

describe('getMatchedFields', () => {
  test('returns matched fields for title match', () => {
    const todo = sampleTodos[0]; // 'Buy groceries'
    const fields = getMatchedFields(todo, 'groceries');
    expect(fields).toContain('title');
    expect(fields).not.toContain('description');
  });

  test('returns matched fields for description match', () => {
    const todo = sampleTodos[1]; // 'Team meeting'
    const fields = getMatchedFields(todo, 'engineering');
    expect(fields).toContain('description');
    expect(fields).not.toContain('title');
  });

  test('returns matched fields for category match', () => {
    const todo = sampleTodos[0]; // category: 'Shopping'
    const fields = getMatchedFields(todo, 'shopping');
    expect(fields).toContain('category');
  });

  test('returns multiple matched fields', () => {
    const todo = sampleTodos[4]; // 'Fix bug in production', desc has 'team'
    const fields = getMatchedFields(todo, 'team');
    expect(fields).toContain('description');
  });

  test('returns empty array when no match', () => {
    const todo = sampleTodos[0];
    const fields = getMatchedFields(todo, 'xyznonexistent');
    expect(fields).toHaveLength(0);
  });

  test('returns empty array for empty search term', () => {
    const todo = sampleTodos[0];
    const fields = getMatchedFields(todo, '');
    expect(fields).toHaveLength(0);
  });
});

describe('enrichWithSearchMeta', () => {
  test('adds _searchMeta to each todo', () => {
    const results = filterTodosBySearch(sampleTodos, 'meeting');
    const enriched = enrichWithSearchMeta(results, 'meeting');

    expect(enriched[0]).toHaveProperty('_searchMeta');
    expect(enriched[0]._searchMeta.searchTerm).toBe('meeting');
    expect(enriched[0]._searchMeta.matchedFields).toContain('title');
  });

  test('does not modify todos when search term is empty', () => {
    const enriched = enrichWithSearchMeta(sampleTodos, '');
    enriched.forEach((todo) => {
      expect(todo).not.toHaveProperty('_searchMeta');
    });
  });

  test('preserves original todo fields', () => {
    const results = filterTodosBySearch(sampleTodos, 'groceries');
    const enriched = enrichWithSearchMeta(results, 'groceries');

    expect(enriched[0].id).toBe('1');
    expect(enriched[0].title).toBe('Buy groceries');
    expect(enriched[0].status).toBe('pending');
  });
});

describe('sanitizeSearchTerm', () => {
  test('trims whitespace', () => {
    expect(sanitizeSearchTerm('  hello  ')).toBe('hello');
  });

  test('limits length to maxLength', () => {
    const longTerm = 'a'.repeat(300);
    const sanitized = sanitizeSearchTerm(longTerm, 200);
    expect(sanitized.length).toBe(200);
  });

  test('removes control characters', () => {
    const termWithControl = 'hello\x00world\x1F';
    const sanitized = sanitizeSearchTerm(termWithControl);
    expect(sanitized).toBe('helloworld');
  });

  test('handles empty string', () => {
    expect(sanitizeSearchTerm('')).toBe('');
  });

  test('handles null/undefined', () => {
    expect(sanitizeSearchTerm(null)).toBe('');
    expect(sanitizeSearchTerm(undefined)).toBe('');
  });

  test('preserves normal search terms', () => {
    expect(sanitizeSearchTerm('buy groceries')).toBe('buy groceries');
    expect(sanitizeSearchTerm('meeting 2024')).toBe('meeting 2024');
  });
});
