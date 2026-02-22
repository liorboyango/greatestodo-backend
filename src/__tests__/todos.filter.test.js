/**
 * Tests for todo filtering functionality
 * Tests the validator schemas and filter query building logic.
 */

const { getTodosQuerySchema } = require('../validators/todos');

describe('getTodosQuerySchema', () => {
  describe('status filter', () => {
    it('accepts valid status values', () => {
      expect(getTodosQuerySchema.validate({ status: 'pending' }).error).toBeUndefined();
      expect(getTodosQuerySchema.validate({ status: 'completed' }).error).toBeUndefined();
    });

    it('rejects invalid status values', () => {
      const { error } = getTodosQuerySchema.validate({ status: 'invalid' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('pending, completed');
    });
  });

  describe('priority filter', () => {
    it('accepts valid priority values', () => {
      expect(getTodosQuerySchema.validate({ priority: 'low' }).error).toBeUndefined();
      expect(getTodosQuerySchema.validate({ priority: 'medium' }).error).toBeUndefined();
      expect(getTodosQuerySchema.validate({ priority: 'high' }).error).toBeUndefined();
    });

    it('rejects invalid priority values', () => {
      const { error } = getTodosQuerySchema.validate({ priority: 'urgent' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('low, medium, high');
    });
  });

  describe('category filter', () => {
    it('accepts valid category strings', () => {
      expect(getTodosQuerySchema.validate({ category: 'Work' }).error).toBeUndefined();
      expect(getTodosQuerySchema.validate({ category: '' }).error).toBeUndefined();
    });

    it('rejects category longer than 50 characters', () => {
      const { error } = getTodosQuerySchema.validate({ category: 'a'.repeat(51) });
      expect(error).toBeDefined();
    });
  });

  describe('due date filters', () => {
    it('accepts valid ISO date strings for dueAfter', () => {
      expect(getTodosQuerySchema.validate({ dueAfter: '2024-01-01' }).error).toBeUndefined();
      expect(
        getTodosQuerySchema.validate({ dueAfter: '2024-01-01T00:00:00.000Z' }).error
      ).toBeUndefined();
    });

    it('rejects invalid date strings for dueAfter', () => {
      const { error } = getTodosQuerySchema.validate({ dueAfter: 'not-a-date' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('ISO 8601');
    });

    it('accepts valid ISO date strings for dueBefore', () => {
      expect(getTodosQuerySchema.validate({ dueBefore: '2024-12-31' }).error).toBeUndefined();
    });

    it('rejects invalid date strings for dueBefore', () => {
      const { error } = getTodosQuerySchema.validate({ dueBefore: '31-12-2024' });
      expect(error).toBeDefined();
    });

    it('accepts both dueAfter and dueBefore together', () => {
      const { error } = getTodosQuerySchema.validate({
        dueAfter: '2024-01-01',
        dueBefore: '2024-12-31',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('sorting', () => {
    it('accepts valid sortBy values', () => {
      const validFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'status'];
      validFields.forEach((field) => {
        expect(getTodosQuerySchema.validate({ sortBy: field }).error).toBeUndefined();
      });
    });

    it('rejects invalid sortBy values', () => {
      const { error } = getTodosQuerySchema.validate({ sortBy: 'invalidField' });
      expect(error).toBeDefined();
    });

    it('accepts valid sortOrder values', () => {
      expect(getTodosQuerySchema.validate({ sortOrder: 'asc' }).error).toBeUndefined();
      expect(getTodosQuerySchema.validate({ sortOrder: 'desc' }).error).toBeUndefined();
    });

    it('rejects invalid sortOrder values', () => {
      const { error } = getTodosQuerySchema.validate({ sortOrder: 'ascending' });
      expect(error).toBeDefined();
    });

    it('defaults sortBy to createdAt and sortOrder to desc', () => {
      const { value } = getTodosQuerySchema.validate({});
      expect(value.sortBy).toBe('createdAt');
      expect(value.sortOrder).toBe('desc');
    });
  });

  describe('pagination', () => {
    it('accepts valid page and limit values', () => {
      expect(getTodosQuerySchema.validate({ page: 1, limit: 20 }).error).toBeUndefined();
      expect(getTodosQuerySchema.validate({ page: 5, limit: 100 }).error).toBeUndefined();
    });

    it('rejects page less than 1', () => {
      const { error } = getTodosQuerySchema.validate({ page: 0 });
      expect(error).toBeDefined();
    });

    it('rejects limit greater than 100', () => {
      const { error } = getTodosQuerySchema.validate({ limit: 101 });
      expect(error).toBeDefined();
    });

    it('defaults page to 1 and limit to 20', () => {
      const { value } = getTodosQuerySchema.validate({});
      expect(value.page).toBe(1);
      expect(value.limit).toBe(20);
    });
  });

  describe('combined filters', () => {
    it('accepts all filters together', () => {
      const { error } = getTodosQuerySchema.validate({
        status: 'pending',
        priority: 'high',
        category: 'Work',
        dueAfter: '2024-01-01',
        dueBefore: '2024-12-31',
        sortBy: 'dueDate',
        sortOrder: 'asc',
        page: 2,
        limit: 10,
      });
      expect(error).toBeUndefined();
    });

    it('rejects unknown query parameters', () => {
      const { error } = getTodosQuerySchema.validate({ unknownParam: 'value' });
      expect(error).toBeDefined();
    });
  });
});
