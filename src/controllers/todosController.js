/**
 * Todos Controller
 * Handles all todo CRUD operations and filtering with Firestore
 */

const { db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');

/**
 * Build a Firestore query with applied filters
 * @param {FirebaseFirestore.CollectionReference} baseQuery - Base collection reference
 * @param {Object} filters - Filter parameters
 * @returns {FirebaseFirestore.Query} - Filtered query
 */
function buildFilteredQuery(baseQuery, filters) {
  let query = baseQuery;

  // Filter by status
  if (filters.status && ['pending', 'completed'].includes(filters.status)) {
    query = query.where('status', '==', filters.status);
  }

  // Filter by priority
  if (filters.priority && ['low', 'medium', 'high'].includes(filters.priority)) {
    query = query.where('priority', '==', filters.priority);
  }

  // Filter by category (case-insensitive exact match stored as lowercase)
  if (filters.category && typeof filters.category === 'string' && filters.category.trim()) {
    query = query.where('categoryLower', '==', filters.category.trim().toLowerCase());
  }

  // Filter by due date range
  if (filters.dueAfter) {
    const dueAfterDate = new Date(filters.dueAfter);
    if (!isNaN(dueAfterDate.getTime())) {
      query = query.where('dueDate', '>=', Timestamp.fromDate(dueAfterDate));
    }
  }

  if (filters.dueBefore) {
    const dueBeforeDate = new Date(filters.dueBefore);
    if (!isNaN(dueBeforeDate.getTime())) {
      query = query.where('dueDate', '<=', Timestamp.fromDate(dueBeforeDate));
    }
  }

  return query;
}

/**
 * Apply sorting to a Firestore query
 * @param {FirebaseFirestore.Query} query - Query to sort
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @param {Object} filters - Active filters (needed to determine valid sort combinations)
 * @returns {FirebaseFirestore.Query} - Sorted query
 */
function applySorting(query, sortBy, sortOrder, filters) {
  const order = sortOrder === 'asc' ? 'asc' : 'desc';

  // When filtering by dueDate range, Firestore requires ordering by dueDate first
  if (filters.dueAfter || filters.dueBefore) {
    query = query.orderBy('dueDate', order);
    if (sortBy && sortBy !== 'dueDate') {
      query = query.orderBy(sortBy, order);
    }
  } else {
    const validSortFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'status'];
    const field = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    query = query.orderBy(field, order);
  }

  return query;
}

/**
 * Format a Firestore todo document into a plain object
 * @param {FirebaseFirestore.DocumentSnapshot} doc - Firestore document
 * @returns {Object} - Formatted todo
 */
function formatTodo(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title,
    description: data.description || null,
    dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : null,
    priority: data.priority,
    category: data.category || null,
    status: data.status,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
  };
}

/**
 * GET /api/todos
 * List todos with optional filtering, sorting, and pagination
 *
 * Query params:
 *   status       - 'pending' | 'completed'
 *   priority     - 'low' | 'medium' | 'high'
 *   category     - string (exact match, case-insensitive)
 *   dueAfter     - ISO date string (inclusive)
 *   dueBefore    - ISO date string (inclusive)
 *   sortBy       - 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title' | 'status'
 *   sortOrder    - 'asc' | 'desc' (default: 'desc')
 *   page         - number (default: 1)
 *   limit        - number (default: 20, max: 100)
 */
async function getTodos(req, res) {
  try {
    const uid = req.user.uid;
    const {
      status,
      priority,
      category,
      dueAfter,
      dueBefore,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filters = { status, priority, category, dueAfter, dueBefore };

    const baseRef = db.collection('users').doc(uid).collection('todos');
    let query = buildFilteredQuery(baseRef, filters);
    query = applySorting(query, sortBy, sortOrder, filters);

    // Get total count for pagination metadata
    // We fetch all matching docs then paginate in-memory for accurate counts
    // (Firestore doesn't support COUNT natively in all SDK versions)
    const allSnapshot = await query.get();
    const totalCount = allSnapshot.size;

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedDocs = allSnapshot.docs.slice(startIndex, startIndex + limitNum);
    const todos = paginatedDocs.map(formatTodo);

    return res.status(200).json({
      todos,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
        hasNextPage: startIndex + limitNum < totalCount,
        hasPrevPage: pageNum > 1,
      },
      filters: {
        status: status || null,
        priority: priority || null,
        category: category || null,
        dueAfter: dueAfter || null,
        dueBefore: dueBefore || null,
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error('getTodos error:', error);
    return res.status(500).json({ error: 'Failed to fetch todos', code: 500 });
  }
}

/**
 * GET /api/todos/filter
 * Dedicated filtering endpoint — same logic as GET /api/todos but semantically
 * explicit for filter-focused clients.
 *
 * Supports all the same query parameters as GET /api/todos.
 */
async function filterTodos(req, res) {
  // Delegate to the main getTodos handler
  return getTodos(req, res);
}

/**
 * GET /api/todos/stats
 * Returns aggregate counts grouped by status, priority, and overdue
 */
async function getTodoStats(req, res) {
  try {
    const uid = req.user.uid;
    const baseRef = db.collection('users').doc(uid).collection('todos');

    const snapshot = await baseRef.get();
    const now = new Date();

    const stats = {
      total: 0,
      pending: 0,
      completed: 0,
      overdue: 0,
      dueSoon: 0, // due within next 7 days and still pending
      byPriority: { low: 0, medium: 0, high: 0 },
    };

    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    snapshot.forEach((doc) => {
      const data = doc.data();
      stats.total++;

      if (data.status === 'completed') {
        stats.completed++;
      } else {
        stats.pending++;

        if (data.dueDate) {
          const dueDate = data.dueDate.toDate();
          if (dueDate < now) {
            stats.overdue++;
          } else if (dueDate <= sevenDaysFromNow) {
            stats.dueSoon++;
          }
        }
      }

      if (data.priority && stats.byPriority[data.priority] !== undefined) {
        stats.byPriority[data.priority]++;
      }
    });

    return res.status(200).json({ stats });
  } catch (error) {
    console.error('getTodoStats error:', error);
    return res.status(500).json({ error: 'Failed to fetch todo stats', code: 500 });
  }
}

/**
 * GET /api/todos/categories
 * Returns a list of unique categories used by the authenticated user
 */
async function getCategories(req, res) {
  try {
    const uid = req.user.uid;
    const baseRef = db.collection('users').doc(uid).collection('todos');

    const snapshot = await baseRef.get();
    const categorySet = new Set();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.category && data.category.trim()) {
        categorySet.add(data.category.trim());
      }
    });

    const categories = Array.from(categorySet).sort();
    return res.status(200).json({ categories });
  } catch (error) {
    console.error('getCategories error:', error);
    return res.status(500).json({ error: 'Failed to fetch categories', code: 500 });
  }
}

/**
 * GET /api/todos/:id
 * Get a single todo by ID
 */
async function getTodoById(req, res) {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    const docRef = db.collection('users').doc(uid).collection('todos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Todo not found', code: 404 });
    }

    return res.status(200).json({ todo: formatTodo(doc) });
  } catch (error) {
    console.error('getTodoById error:', error);
    return res.status(500).json({ error: 'Failed to fetch todo', code: 500 });
  }
}

/**
 * POST /api/todos
 * Create a new todo
 */
async function createTodo(req, res) {
  try {
    const uid = req.user.uid;
    const { title, description, dueDate, priority = 'medium', category, status = 'pending' } = req.body;

    const now = Timestamp.now();
    const todoData = {
      title: title.trim(),
      description: description ? description.trim() : null,
      dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      priority,
      category: category ? category.trim() : null,
      categoryLower: category ? category.trim().toLowerCase() : null,
      status,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('users').doc(uid).collection('todos').add(todoData);
    const newDoc = await docRef.get();

    return res.status(201).json({ todo: formatTodo(newDoc) });
  } catch (error) {
    console.error('createTodo error:', error);
    return res.status(500).json({ error: 'Failed to create todo', code: 500 });
  }
}

/**
 * PUT /api/todos/:id
 * Update an existing todo (partial update)
 */
async function updateTodo(req, res) {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    const docRef = db.collection('users').doc(uid).collection('todos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Todo not found', code: 404 });
    }

    const allowedFields = ['title', 'description', 'dueDate', 'priority', 'category', 'status'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'dueDate') {
          updates.dueDate = req.body.dueDate
            ? Timestamp.fromDate(new Date(req.body.dueDate))
            : null;
        } else if (field === 'title') {
          updates.title = req.body.title.trim();
        } else if (field === 'description') {
          updates.description = req.body.description ? req.body.description.trim() : null;
        } else if (field === 'category') {
          updates.category = req.body.category ? req.body.category.trim() : null;
          updates.categoryLower = req.body.category ? req.body.category.trim().toLowerCase() : null;
        } else {
          updates[field] = req.body[field];
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update', code: 400 });
    }

    updates.updatedAt = Timestamp.now();

    await docRef.update(updates);
    const updatedDoc = await docRef.get();

    return res.status(200).json({ todo: formatTodo(updatedDoc) });
  } catch (error) {
    console.error('updateTodo error:', error);
    return res.status(500).json({ error: 'Failed to update todo', code: 500 });
  }
}

/**
 * DELETE /api/todos/:id
 * Delete a todo by ID
 */
async function deleteTodo(req, res) {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    const docRef = db.collection('users').doc(uid).collection('todos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Todo not found', code: 404 });
    }

    await docRef.delete();

    return res.status(200).json({ success: true, message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('deleteTodo error:', error);
    return res.status(500).json({ error: 'Failed to delete todo', code: 500 });
  }
}

module.exports = {
  getTodos,
  filterTodos,
  getTodoStats,
  getCategories,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
};
