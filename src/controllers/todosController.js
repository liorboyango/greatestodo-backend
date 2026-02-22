/**
 * Todos Controller
 * Handles all todo CRUD operations, filtering, and search functionality.
 * Todos are stored as a subcollection under each user: users/{uid}/todos/{todoId}
 */

const { db } = require('../config/firebase');
const { createTodoSchema, updateTodoSchema, listTodosSchema } = require('../validators/todos');

/**
 * Performs case-insensitive search on todo fields.
 * Since Firestore doesn't support native full-text search, we fetch filtered
 * results and apply in-memory search on title and description.
 *
 * @param {Array} todos - Array of todo objects to search through
 * @param {string} searchTerm - The search term to match against
 * @returns {Array} Filtered todos matching the search term
 */
function applySearch(todos, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return todos;
  }

  const normalizedTerm = searchTerm.trim().toLowerCase();

  return todos.filter((todo) => {
    const titleMatch = todo.title && todo.title.toLowerCase().includes(normalizedTerm);
    const descriptionMatch =
      todo.description && todo.description.toLowerCase().includes(normalizedTerm);
    const categoryMatch = todo.category && todo.category.toLowerCase().includes(normalizedTerm);

    return titleMatch || descriptionMatch || categoryMatch;
  });
}

/**
 * Adds search metadata to each todo indicating which fields matched.
 *
 * @param {Array} todos - Array of todo objects
 * @param {string} searchTerm - The search term used
 * @returns {Array} Todos with _searchMeta field added
 */
function addSearchMetadata(todos, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return todos;
  }

  const normalizedTerm = searchTerm.trim().toLowerCase();

  return todos.map((todo) => {
    const matchedFields = [];

    if (todo.title && todo.title.toLowerCase().includes(normalizedTerm)) {
      matchedFields.push('title');
    }
    if (todo.description && todo.description.toLowerCase().includes(normalizedTerm)) {
      matchedFields.push('description');
    }
    if (todo.category && todo.category.toLowerCase().includes(normalizedTerm)) {
      matchedFields.push('category');
    }

    return {
      ...todo,
      _searchMeta: {
        matchedFields,
        searchTerm: searchTerm.trim(),
      },
    };
  });
}

/**
 * GET /api/todos
 * List todos with optional filtering and search.
 *
 * Query Parameters:
 *   - status: 'pending' | 'completed'
 *   - priority: 'low' | 'medium' | 'high'
 *   - category: string
 *   - search: string (searches title, description, category)
 *   - dueAfter: ISO date string
 *   - dueBefore: ISO date string
 *   - limit: number (default 20, max 100)
 *   - page: number (default 1)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function listTodos(req, res) {
  try {
    // Validate query parameters
    const { error, value: query } = listTodosSchema.validate(req.query, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join(', '),
        code: 400,
      });
    }

    const uid = req.user.uid;
    const { status, priority, category, search, dueAfter, dueBefore, limit, page } = query;

    // Build Firestore query — start with user's todos subcollection
    let todosRef = db.collection('users').doc(uid).collection('todos');
    let firestoreQuery = todosRef;

    // Apply Firestore-level filters (indexed fields)
    if (status) {
      firestoreQuery = firestoreQuery.where('status', '==', status);
    }
    if (priority) {
      firestoreQuery = firestoreQuery.where('priority', '==', priority);
    }
    if (category) {
      firestoreQuery = firestoreQuery.where('category', '==', category);
    }
    if (dueAfter) {
      firestoreQuery = firestoreQuery.where('dueDate', '>=', new Date(dueAfter));
    }
    if (dueBefore) {
      firestoreQuery = firestoreQuery.where('dueDate', '<=', new Date(dueBefore));
    }

    // Order by creation date (newest first)
    firestoreQuery = firestoreQuery.orderBy('createdAt', 'desc');

    // Execute Firestore query
    const snapshot = await firestoreQuery.get();

    // Map Firestore documents to plain objects
    let todos = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore Timestamps to ISO strings for JSON serialization
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
      dueDate: doc.data().dueDate ? doc.data().dueDate.toDate().toISOString() : null,
    }));

    // Apply in-memory search (Firestore doesn't support native full-text search)
    if (search) {
      todos = applySearch(todos, search);
      // Add search metadata to each matched todo
      todos = addSearchMetadata(todos, search);
    }

    // Total count after search filtering
    const totalCount = todos.length;

    // Apply pagination
    const pageNum = page || 1;
    const limitNum = limit || 20;
    const offset = (pageNum - 1) * limitNum;
    const paginatedTodos = todos.slice(offset, offset + limitNum);

    return res.status(200).json({
      todos: paginatedTodos,
      totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
      ...(search && { searchTerm: search.trim() }),
    });
  } catch (err) {
    console.error('Error listing todos:', err);
    return res.status(500).json({
      error: 'Failed to retrieve todos',
      code: 500,
    });
  }
}

/**
 * GET /api/todos/search
 * Dedicated search endpoint for todos.
 * Searches across title, description, and category fields.
 *
 * Query Parameters:
 *   - q: string (required) — the search query
 *   - status: 'pending' | 'completed' (optional filter)
 *   - priority: 'low' | 'medium' | 'high' (optional filter)
 *   - limit: number (default 20, max 100)
 *   - page: number (default 1)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function searchTodos(req, res) {
  try {
    const { q, status, priority, limit, page } = req.query;

    // Validate search query
    if (!q || q.trim() === '') {
      return res.status(400).json({
        error: 'Search query parameter "q" is required and cannot be empty',
        code: 400,
      });
    }

    const searchTerm = q.trim();

    // Validate search term length
    if (searchTerm.length > 200) {
      return res.status(400).json({
        error: 'Search query cannot exceed 200 characters',
        code: 400,
      });
    }

    // Validate pagination params
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    if (pageNum < 1) {
      return res.status(400).json({
        error: 'Page must be a positive integer',
        code: 400,
      });
    }

    const uid = req.user.uid;

    // Build Firestore query with optional filters
    let firestoreQuery = db.collection('users').doc(uid).collection('todos');

    if (status && ['pending', 'completed'].includes(status)) {
      firestoreQuery = firestoreQuery.where('status', '==', status);
    }
    if (priority && ['low', 'medium', 'high'].includes(priority)) {
      firestoreQuery = firestoreQuery.where('priority', '==', priority);
    }

    // Order by creation date
    firestoreQuery = firestoreQuery.orderBy('createdAt', 'desc');

    // Fetch all matching documents (search requires in-memory filtering)
    const snapshot = await firestoreQuery.get();

    // Map to plain objects
    let todos = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
      dueDate: doc.data().dueDate ? doc.data().dueDate.toDate().toISOString() : null,
    }));

    // Apply full-text search
    todos = applySearch(todos, searchTerm);

    // Add search metadata
    todos = addSearchMetadata(todos, searchTerm);

    // Total count after search
    const totalCount = todos.length;

    // Apply pagination
    const offset = (pageNum - 1) * limitNum;
    const paginatedTodos = todos.slice(offset, offset + limitNum);

    return res.status(200).json({
      todos: paginatedTodos,
      totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
      searchTerm,
    });
  } catch (err) {
    console.error('Error searching todos:', err);
    return res.status(500).json({
      error: 'Failed to search todos',
      code: 500,
    });
  }
}

/**
 * POST /api/todos
 * Create a new todo for the authenticated user.
 *
 * Request Body:
 *   - title: string (required, max 200)
 *   - description: string (optional)
 *   - dueDate: ISO date string (optional)
 *   - priority: 'low' | 'medium' | 'high' (default 'medium')
 *   - category: string (optional, max 50)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createTodo(req, res) {
  try {
    const { error, value } = createTodoSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join(', '),
        code: 400,
      });
    }

    const uid = req.user.uid;
    const now = new Date();

    const todoData = {
      title: value.title.trim(),
      description: value.description ? value.description.trim() : '',
      dueDate: value.dueDate ? new Date(value.dueDate) : null,
      priority: value.priority || 'medium',
      category: value.category ? value.category.trim() : '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('users').doc(uid).collection('todos').add(todoData);

    return res.status(201).json({
      id: docRef.id,
      ...todoData,
      createdAt: todoData.createdAt.toISOString(),
      updatedAt: todoData.updatedAt.toISOString(),
      dueDate: todoData.dueDate ? todoData.dueDate.toISOString() : null,
    });
  } catch (err) {
    console.error('Error creating todo:', err);
    return res.status(500).json({
      error: 'Failed to create todo',
      code: 500,
    });
  }
}

/**
 * PUT /api/todos/:id
 * Update an existing todo (partial update supported).
 *
 * URL Parameters:
 *   - id: string (todo document ID)
 *
 * Request Body (all optional):
 *   - title: string (max 200)
 *   - description: string
 *   - dueDate: ISO date string | null
 *   - priority: 'low' | 'medium' | 'high'
 *   - category: string (max 50)
 *   - status: 'pending' | 'completed'
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateTodo(req, res) {
  try {
    const { error, value } = updateTodoSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join(', '),
        code: 400,
      });
    }

    const uid = req.user.uid;
    const todoId = req.params.id;

    const todoRef = db.collection('users').doc(uid).collection('todos').doc(todoId);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return res.status(404).json({
        error: 'Todo not found',
        code: 404,
      });
    }

    // Build update object with only provided fields
    const updates = { updatedAt: new Date() };

    if (value.title !== undefined) updates.title = value.title.trim();
    if (value.description !== undefined) updates.description = value.description.trim();
    if (value.priority !== undefined) updates.priority = value.priority;
    if (value.category !== undefined) updates.category = value.category.trim();
    if (value.status !== undefined) updates.status = value.status;
    if (value.dueDate !== undefined) {
      updates.dueDate = value.dueDate ? new Date(value.dueDate) : null;
    }

    await todoRef.update(updates);

    // Fetch updated document
    const updatedDoc = await todoRef.get();
    const updatedData = updatedDoc.data();

    return res.status(200).json({
      id: todoId,
      ...updatedData,
      createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
      updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
      dueDate: updatedData.dueDate ? updatedData.dueDate.toDate().toISOString() : null,
    });
  } catch (err) {
    console.error('Error updating todo:', err);
    return res.status(500).json({
      error: 'Failed to update todo',
      code: 500,
    });
  }
}

/**
 * DELETE /api/todos/:id
 * Delete a todo by ID.
 *
 * URL Parameters:
 *   - id: string (todo document ID)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteTodo(req, res) {
  try {
    const uid = req.user.uid;
    const todoId = req.params.id;

    const todoRef = db.collection('users').doc(uid).collection('todos').doc(todoId);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return res.status(404).json({
        error: 'Todo not found',
        code: 404,
      });
    }

    await todoRef.delete();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error deleting todo:', err);
    return res.status(500).json({
      error: 'Failed to delete todo',
      code: 500,
    });
  }
}

/**
 * GET /api/todos/:id
 * Get a single todo by ID.
 *
 * URL Parameters:
 *   - id: string (todo document ID)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getTodo(req, res) {
  try {
    const uid = req.user.uid;
    const todoId = req.params.id;

    const todoRef = db.collection('users').doc(uid).collection('todos').doc(todoId);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return res.status(404).json({
        error: 'Todo not found',
        code: 404,
      });
    }

    const data = todoDoc.data();

    return res.status(200).json({
      id: todoId,
      ...data,
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
      dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : null,
    });
  } catch (err) {
    console.error('Error fetching todo:', err);
    return res.status(500).json({
      error: 'Failed to retrieve todo',
      code: 500,
    });
  }
}

module.exports = {
  listTodos,
  searchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodo,
};
