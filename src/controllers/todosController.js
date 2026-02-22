/**
 * Todos Controller
 *
 * Handles all CRUD operations for todos stored in Firestore.
 * Each user's todos are stored in a subcollection: users/{uid}/todos/{todoId}
 *
 * Endpoints:
 *   GET    /api/todos        - List todos with optional filters, search, pagination
 *   POST   /api/todos        - Create a new todo
 *   PUT    /api/todos/:id    - Update an existing todo (partial update)
 *   DELETE /api/todos/:id    - Delete a todo
 */

const { getFirestore, FieldValue, Timestamp } = require('../config/firebase');
const {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
} = require('../validators/todos');

/**
 * Priority sort order for in-memory sorting when Firestore compound
 * indexes are not available.
 */
const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 };

/**
 * Helper: Get the Firestore todos subcollection reference for a user.
 * @param {string} uid - Firebase user UID
 * @returns {FirebaseFirestore.CollectionReference}
 */
function getTodosRef(uid) {
  const db = getFirestore();
  return db.collection('users').doc(uid).collection('todos');
}

/**
 * Helper: Serialize a Firestore document snapshot to a plain object.
 * Converts Firestore Timestamps to ISO strings for JSON serialization.
 * @param {FirebaseFirestore.DocumentSnapshot} doc
 * @returns {Object}
 */
function serializeTodo(doc) {
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
 *
 * List todos for the authenticated user with optional filtering,
 * search, sorting, and pagination.
 *
 * Query Parameters:
 *   - status       {string}  Filter by 'pending' or 'completed'
 *   - priority     {string}  Filter by 'low', 'medium', or 'high'
 *   - category     {string}  Filter by category name (exact match)
 *   - search       {string}  Full-text search on title and description
 *   - dueAfter     {string}  ISO date — only todos with dueDate >= this value
 *   - dueBefore    {string}  ISO date — only todos with dueDate <= this value
 *   - limit        {number}  Items per page (default: 20, max: 100)
 *   - page         {number}  Page number (default: 1)
 *   - sortBy       {string}  Field to sort by (default: 'createdAt')
 *   - sortOrder    {string}  'asc' or 'desc' (default: 'desc')
 *
 * Response: { todos: [...], totalCount: number, page: number, limit: number, totalPages: number }
 */
async function listTodos(req, res) {
  try {
    // Validate query parameters
    const { error, value: query } = listTodosQuerySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const uid = req.user.uid;
    const todosRef = getTodosRef(uid);

    // Build Firestore query with equality filters
    // Note: Firestore requires composite indexes for multiple where + orderBy.
    // We apply simple equality filters in Firestore and handle range/search in memory.
    let firestoreQuery = todosRef;

    if (query.status) {
      firestoreQuery = firestoreQuery.where('status', '==', query.status);
    }

    if (query.priority) {
      firestoreQuery = firestoreQuery.where('priority', '==', query.priority);
    }

    if (query.category) {
      firestoreQuery = firestoreQuery.where('category', '==', query.category);
    }

    // Fetch all matching documents (we'll apply range/search/sort in memory)
    const snapshot = await firestoreQuery.get();
    let todos = snapshot.docs.map(serializeTodo);

    // Apply dueAfter filter in memory
    if (query.dueAfter) {
      const dueAfterMs = new Date(query.dueAfter).getTime();
      todos = todos.filter((t) => t.dueDate && new Date(t.dueDate).getTime() >= dueAfterMs);
    }

    // Apply dueBefore filter in memory
    if (query.dueBefore) {
      const dueBeforeMs = new Date(query.dueBefore).getTime();
      todos = todos.filter((t) => t.dueDate && new Date(t.dueDate).getTime() <= dueBeforeMs);
    }

    // Apply search filter in memory (case-insensitive substring match on title + description)
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      todos = todos.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(searchLower)) ||
          (t.description && t.description.toLowerCase().includes(searchLower))
      );
    }

    // Sort in memory
    const { sortBy, sortOrder } = query;
    todos.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Special handling for priority (string -> numeric order)
      if (sortBy === 'priority') {
        aVal = PRIORITY_ORDER[aVal] || 0;
        bVal = PRIORITY_ORDER[bVal] || 0;
      } else if (sortBy === 'dueDate') {
        // Nulls last
        if (!aVal && !bVal) return 0;
        if (!aVal) return 1;
        if (!bVal) return -1;
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (sortBy === 'title') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      } else {
        // Date strings (createdAt, updatedAt)
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const totalCount = todos.length;
    const limit = query.limit;
    const page = query.page;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedTodos = todos.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      todos: paginatedTodos,
      totalCount,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error('[todosController.listTodos] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

/**
 * POST /api/todos
 *
 * Create a new todo for the authenticated user.
 *
 * Request Body:
 *   - title       {string}  Required. Max 200 chars.
 *   - description {string}  Optional. Max 2000 chars.
 *   - dueDate     {string}  Optional. ISO 8601 date string.
 *   - priority    {string}  Optional. 'low' | 'medium' | 'high'. Default: 'medium'.
 *   - category    {string}  Optional. Max 50 chars.
 *   - status      {string}  Optional. 'pending' | 'completed'. Default: 'pending'.
 *
 * Response: 201 { id, title, description, dueDate, priority, category, status, createdAt, updatedAt }
 */
async function createTodo(req, res) {
  try {
    // Validate request body
    const { error, value } = createTodoSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const uid = req.user.uid;
    const todosRef = getTodosRef(uid);
    const now = FieldValue.serverTimestamp();

    // Build the todo document
    const todoData = {
      title: value.title,
      description: value.description || null,
      dueDate: value.dueDate ? Timestamp.fromDate(new Date(value.dueDate)) : null,
      priority: value.priority || 'medium',
      category: value.category || null,
      status: value.status || 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await todosRef.add(todoData);

    // Fetch the created document to return accurate server timestamps
    const createdDoc = await docRef.get();
    const createdTodo = serializeTodo(createdDoc);

    return res.status(201).json(createdTodo);
  } catch (err) {
    console.error('[todosController.createTodo] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

/**
 * PUT /api/todos/:id
 *
 * Partially update an existing todo for the authenticated user.
 * Only provided fields are updated; omitted fields remain unchanged.
 *
 * URL Params:
 *   - id {string} Todo document ID
 *
 * Request Body (all optional, at least one required):
 *   - title       {string}
 *   - description {string}
 *   - dueDate     {string|null}
 *   - priority    {string}
 *   - category    {string|null}
 *   - status      {string}
 *
 * Response: 200 { id, title, description, dueDate, priority, category, status, createdAt, updatedAt }
 */
async function updateTodo(req, res) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'Todo ID is required', code: 400 });
    }

    // Validate request body
    const { error, value } = updateTodoSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const uid = req.user.uid;
    const todosRef = getTodosRef(uid);
    const docRef = todosRef.doc(id);

    // Verify the todo exists and belongs to the user
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return res.status(404).json({ error: 'Todo not found', code: 404 });
    }

    // Build the update payload — only include provided fields
    const updateData = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (value.title !== undefined) updateData.title = value.title;
    if (value.description !== undefined) updateData.description = value.description || null;
    if (value.priority !== undefined) updateData.priority = value.priority;
    if (value.category !== undefined) updateData.category = value.category || null;
    if (value.status !== undefined) updateData.status = value.status;

    // Handle dueDate: allow explicit null to clear the field
    if ('dueDate' in value) {
      updateData.dueDate = value.dueDate
        ? Timestamp.fromDate(new Date(value.dueDate))
        : null;
    }

    await docRef.update(updateData);

    // Fetch and return the updated document
    const updatedDoc = await docRef.get();
    const updatedTodo = serializeTodo(updatedDoc);

    return res.status(200).json(updatedTodo);
  } catch (err) {
    console.error('[todosController.updateTodo] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

/**
 * DELETE /api/todos/:id
 *
 * Delete a todo for the authenticated user.
 *
 * URL Params:
 *   - id {string} Todo document ID
 *
 * Response: 200 { success: true, message: 'Todo deleted successfully' }
 */
async function deleteTodo(req, res) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'Todo ID is required', code: 400 });
    }

    const uid = req.user.uid;
    const todosRef = getTodosRef(uid);
    const docRef = todosRef.doc(id);

    // Verify the todo exists and belongs to the user
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return res.status(404).json({ error: 'Todo not found', code: 404 });
    }

    await docRef.delete();

    return res.status(200).json({ success: true, message: 'Todo deleted successfully' });
  } catch (err) {
    console.error('[todosController.deleteTodo] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

/**
 * GET /api/todos/:id
 *
 * Retrieve a single todo by ID for the authenticated user.
 *
 * URL Params:
 *   - id {string} Todo document ID
 *
 * Response: 200 { id, title, description, dueDate, priority, category, status, createdAt, updatedAt }
 */
async function getTodo(req, res) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'Todo ID is required', code: 400 });
    }

    const uid = req.user.uid;
    const todosRef = getTodosRef(uid);
    const docRef = todosRef.doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Todo not found', code: 404 });
    }

    return res.status(200).json(serializeTodo(doc));
  } catch (err) {
    console.error('[todosController.getTodo] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

module.exports = {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodo,
};
