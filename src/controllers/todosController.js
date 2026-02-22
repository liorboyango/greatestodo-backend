/**
 * Todos Controller
 *
 * Handles CRUD operations for todos stored in Firestore.
 * Each user's todos are stored in a subcollection: users/{uid}/todos/{todoId}
 *
 * All input validation is handled upstream by Joi middleware.
 * Firestore errors are handled by the centralized error handler.
 */

const { getFirestore } = require('../config/firebase');
const { createError } = require('../middleware/errorHandler');
const { Timestamp } = require('firebase-admin/firestore');

/**
 * Converts a Firestore document snapshot to a plain todo object.
 *
 * @param {import('firebase-admin/firestore').DocumentSnapshot} doc
 * @returns {Object} Plain todo object with id and serialized timestamps
 */
const docToTodo = (doc) => {
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
};

/**
 * GET /api/todos
 *
 * Lists todos for the authenticated user with optional filters.
 * Supports: status, priority, category, search, dueAfter, dueBefore, limit, page, sortBy, sortOrder
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const listTodos = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const db = getFirestore();

    const {
      status,
      priority,
      category,
      search,
      dueAfter,
      dueBefore,
      limit = 20,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    let query = db.collection('users').doc(uid).collection('todos');

    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }
    if (priority) {
      query = query.where('priority', '==', priority);
    }
    if (category) {
      query = query.where('category', '==', category);
    }
    if (dueAfter) {
      query = query.where('dueDate', '>=', Timestamp.fromDate(new Date(dueAfter)));
    }
    if (dueBefore) {
      query = query.where('dueDate', '<=', Timestamp.fromDate(new Date(dueBefore)));
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'updatedAt', 'dueDate', 'title'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const direction = sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.orderBy(sortField, direction);

    // Fetch all matching docs for total count and search filtering
    const snapshot = await query.get();
    let todos = snapshot.docs.map(docToTodo);

    // Apply in-memory search (Firestore doesn't support full-text search natively)
    if (search) {
      const searchLower = search.toLowerCase().trim();
      todos = todos.filter(
        (todo) =>
          todo.title.toLowerCase().includes(searchLower) ||
          (todo.description && todo.description.toLowerCase().includes(searchLower)) ||
          (todo.category && todo.category.toLowerCase().includes(searchLower))
      );
    }

    const totalCount = todos.length;

    // Apply pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedTodos = todos.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      todos: paginatedTodos,
      totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/todos
 *
 * Creates a new todo for the authenticated user.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createTodo = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const db = getFirestore();

    const { title, description, dueDate, priority, category, status } = req.body;

    const now = Timestamp.now();

    const todoData = {
      title: title.trim(),
      description: description ? description.trim() : null,
      dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      priority: priority || 'medium',
      category: category ? category.trim() : null,
      status: status || 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db
      .collection('users')
      .doc(uid)
      .collection('todos')
      .add(todoData);

    const newDoc = await docRef.get();

    return res.status(201).json(docToTodo(newDoc));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/todos/:id
 *
 * Updates an existing todo for the authenticated user.
 * Only provided fields are updated (partial update).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateTodo = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const { id } = req.params;
    const db = getFirestore();

    const docRef = db.collection('users').doc(uid).collection('todos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return next(createError('Todo not found.', 404));
    }

    const { title, description, dueDate, priority, category, status } = req.body;

    const updates = {
      updatedAt: Timestamp.now(),
    };

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (dueDate !== undefined) {
      updates.dueDate = dueDate ? Timestamp.fromDate(new Date(dueDate)) : null;
    }
    if (priority !== undefined) updates.priority = priority;
    if (category !== undefined) updates.category = category ? category.trim() : null;
    if (status !== undefined) updates.status = status;

    await docRef.update(updates);

    const updatedDoc = await docRef.get();

    return res.status(200).json(docToTodo(updatedDoc));
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/todos/:id
 *
 * Deletes a todo for the authenticated user.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteTodo = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const { id } = req.params;
    const db = getFirestore();

    const docRef = db.collection('users').doc(uid).collection('todos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return next(createError('Todo not found.', 404));
    }

    await docRef.delete();

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { listTodos, createTodo, updateTodo, deleteTodo };
