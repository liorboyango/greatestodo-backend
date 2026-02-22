/**
 * Todos Controller
 *
 * Handles CRUD operations for todos stored in Firestore.
 * All operations are scoped to the authenticated user's subcollection:
 * users/{uid}/todos/{todoId}
 *
 * GET    /api/todos       - List todos with optional filters
 * POST   /api/todos       - Create a new todo
 * PUT    /api/todos/:id   - Update an existing todo
 * DELETE /api/todos/:id   - Delete a todo
 */

const { admin, db } = require('../config/firebase');
const {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  validate,
} = require('../validators/todos');
const logger = require('../utils/logger');

/**
 * Get the todos subcollection reference for a user
 * @param {string} uid - User ID
 * @returns {FirebaseFirestore.CollectionReference}
 */
function getTodosRef(uid) {
  return db.collection('users').doc(uid).collection('todos');
}

/**
 * List todos with optional filters, search, and pagination
 * @route GET /api/todos
 */
async function listTodos(req, res, next) {
  try {
    const { uid } = req.user;

    // Validate query parameters
    const { value: query, error } = validate(listTodosQuerySchema, req.query);
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const {
      status,
      priority,
      category,
      search,
      dueAfter,
      dueBefore,
      limit,
      page,
      sortBy,
      sortOrder,
    } = query;

    let todosQuery = getTodosRef(uid);

    // Apply filters
    if (status) {
      todosQuery = todosQuery.where('status', '==', status);
    }
    if (priority) {
      todosQuery = todosQuery.where('priority', '==', priority);
    }
    if (category) {
      todosQuery = todosQuery.where('category', '==', category);
    }
    if (dueAfter) {
      todosQuery = todosQuery.where(
        'dueDate',
        '>=',
        admin.firestore.Timestamp.fromDate(new Date(dueAfter))
      );
    }
    if (dueBefore) {
      todosQuery = todosQuery.where(
        'dueDate',
        '<=',
        admin.firestore.Timestamp.fromDate(new Date(dueBefore))
      );
    }

    // Apply sorting
    todosQuery = todosQuery.orderBy(sortBy, sortOrder);

    // Execute query to get total count (for pagination metadata)
    const allDocsSnapshot = await todosQuery.get();
    let allDocs = allDocsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore Timestamps to ISO strings
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
      dueDate: doc.data().dueDate ? doc.data().dueDate.toDate().toISOString() : null,
    }));

    // Apply client-side search filter (Firestore doesn't support full-text search natively)
    if (search) {
      const searchLower = search.toLowerCase();
      allDocs = allDocs.filter(
        (todo) =>
          todo.title.toLowerCase().includes(searchLower) ||
          (todo.description && todo.description.toLowerCase().includes(searchLower)) ||
          (todo.category && todo.category.toLowerCase().includes(searchLower))
      );
    }

    const totalCount = allDocs.length;

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedDocs = allDocs.slice(offset, offset + limit);

    logger.debug('Todos listed', {
      uid,
      totalCount,
      page,
      limit,
      filters: { status, priority, category, search },
    });

    return res.status(200).json({
      todos: paginatedDocs,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err) {
    logger.error('Error listing todos', { error: err.message, uid: req.user.uid });
    next(err);
  }
}

/**
 * Create a new todo
 * @route POST /api/todos
 */
async function createTodo(req, res, next) {
  try {
    const { uid } = req.user;

    // Validate request body
    const { value, error } = validate(createTodoSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    const todoData = {
      title: value.title,
      description: value.description || null,
      dueDate: value.dueDate
        ? admin.firestore.Timestamp.fromDate(new Date(value.dueDate))
        : null,
      priority: value.priority || 'medium',
      category: value.category || null,
      status: value.status || 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await getTodosRef(uid).add(todoData);
    const newDoc = await docRef.get();
    const data = newDoc.data();

    const todo = {
      id: docRef.id,
      ...data,
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
      dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : null,
    };

    logger.info('Todo created', { uid, todoId: docRef.id, title: value.title });

    return res.status(201).json(todo);
  } catch (err) {
    logger.error('Error creating todo', { error: err.message, uid: req.user.uid });
    next(err);
  }
}

/**
 * Update an existing todo (partial update)
 * @route PUT /api/todos/:id
 */
async function updateTodo(req, res, next) {
  try {
    const { uid } = req.user;
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'Todo ID is required', code: 400 });
    }

    // Validate request body
    const { value, error } = validate(updateTodoSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const todoRef = getTodosRef(uid).doc(id);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return res.status(404).json({
        error: 'Todo not found',
        code: 404,
      });
    }

    // Build update object
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (value.title !== undefined) updateData.title = value.title;
    if (value.description !== undefined) updateData.description = value.description;
    if (value.priority !== undefined) updateData.priority = value.priority;
    if (value.category !== undefined) updateData.category = value.category;
    if (value.status !== undefined) updateData.status = value.status;
    if (value.dueDate !== undefined) {
      updateData.dueDate = value.dueDate
        ? admin.firestore.Timestamp.fromDate(new Date(value.dueDate))
        : null;
    }

    await todoRef.update(updateData);

    const updatedDoc = await todoRef.get();
    const data = updatedDoc.data();

    const todo = {
      id: updatedDoc.id,
      ...data,
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
      dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : null,
    };

    logger.info('Todo updated', { uid, todoId: id });

    return res.status(200).json(todo);
  } catch (err) {
    logger.error('Error updating todo', { error: err.message, uid: req.user.uid, todoId: req.params.id });
    next(err);
  }
}

/**
 * Delete a todo
 * @route DELETE /api/todos/:id
 */
async function deleteTodo(req, res, next) {
  try {
    const { uid } = req.user;
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'Todo ID is required', code: 400 });
    }

    const todoRef = getTodosRef(uid).doc(id);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return res.status(404).json({
        error: 'Todo not found',
        code: 404,
      });
    }

    await todoRef.delete();

    logger.info('Todo deleted', { uid, todoId: id });

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Error deleting todo', { error: err.message, uid: req.user.uid, todoId: req.params.id });
    next(err);
  }
}

module.exports = { listTodos, createTodo, updateTodo, deleteTodo };
