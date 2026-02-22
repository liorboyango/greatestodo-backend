/**
 * Todo Model
 *
 * Defines the data structure and helper functions for todo documents in Firestore.
 * Collection path: users/{uid}/todos/{todoId}
 *
 * Schema:
 *   title:       string              - Required, max 200 chars
 *   description: string?             - Optional, max 1000 chars
 *   dueDate:     timestamp | null    - Optional due date
 *   priority:    'low'|'medium'|'high' - Default: 'medium'
 *   category:    string?             - Optional category label, max 50 chars
 *   status:      'pending'|'completed' - Default: 'pending'
 *   createdAt:   timestamp           - Creation timestamp
 *   updatedAt:   timestamp           - Last update timestamp
 */

'use strict';

const admin = require('firebase-admin');

/**
 * Valid priority values for todos.
 * @type {string[]}
 */
const PRIORITY_VALUES = ['low', 'medium', 'high'];

/**
 * Valid status values for todos.
 * @type {string[]}
 */
const STATUS_VALUES = ['pending', 'completed'];

/**
 * Todo document schema definition (for documentation and reference).
 */
const TODO_SCHEMA = {
  title: { type: 'string', required: true, maxLength: 200, description: 'Todo title' },
  description: { type: 'string', required: false, maxLength: 1000, description: 'Optional description' },
  dueDate: { type: 'timestamp', required: false, description: 'Optional due date' },
  priority: { type: 'string', required: false, enum: PRIORITY_VALUES, default: 'medium', description: 'Priority level' },
  category: { type: 'string', required: false, maxLength: 50, description: 'Optional category label' },
  status: { type: 'string', required: false, enum: STATUS_VALUES, default: 'pending', description: 'Todo status' },
  createdAt: { type: 'timestamp', required: true, description: 'Creation timestamp' },
  updatedAt: { type: 'timestamp', required: true, description: 'Last update timestamp' },
};

/**
 * Converts a date value to a Firestore Timestamp.
 * Returns null if the value is invalid or falsy.
 *
 * @param {string|Date|null|undefined} dateValue - Date to convert
 * @returns {FirebaseFirestore.Timestamp|null}
 */
function toFirestoreTimestamp(dateValue) {
  if (!dateValue) return null;
  const dateObj = new Date(dateValue);
  if (isNaN(dateObj.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(dateObj);
}

/**
 * Creates a new todo document object ready for Firestore insertion.
 *
 * @param {Object} data - Todo data from request
 * @param {string} data.title - Todo title (required)
 * @param {string} [data.description] - Optional description
 * @param {string|Date} [data.dueDate] - Optional due date
 * @param {string} [data.priority='medium'] - Priority: 'low'|'medium'|'high'
 * @param {string} [data.category] - Optional category
 * @param {string} [data.status='pending'] - Status: 'pending'|'completed'
 * @returns {Object} Todo document object
 */
function createTodoDocument(data) {
  const now = admin.firestore.FieldValue.serverTimestamp();

  return {
    title: data.title.trim(),
    description: data.description ? data.description.trim() : '',
    priority: PRIORITY_VALUES.includes(data.priority) ? data.priority : 'medium',
    category: data.category ? data.category.trim() : '',
    status: STATUS_VALUES.includes(data.status) ? data.status : 'pending',
    dueDate: toFirestoreTimestamp(data.dueDate),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a partial update object for a todo document.
 * Only includes fields that are explicitly provided in the update data.
 * Always sets updatedAt to the server timestamp.
 *
 * @param {Object} data - Fields to update (only provided fields are included)
 * @returns {Object} Update object for Firestore
 */
function createTodoUpdateDocument(data) {
  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (data.title !== undefined) {
    updates.title = data.title.trim();
  }

  if (data.description !== undefined) {
    updates.description = data.description ? data.description.trim() : '';
  }

  if (data.priority !== undefined && PRIORITY_VALUES.includes(data.priority)) {
    updates.priority = data.priority;
  }

  if (data.category !== undefined) {
    updates.category = data.category ? data.category.trim() : '';
  }

  if (data.status !== undefined && STATUS_VALUES.includes(data.status)) {
    updates.status = data.status;
  }

  if (data.dueDate !== undefined) {
    updates.dueDate = data.dueDate === null ? null : toFirestoreTimestamp(data.dueDate);
  }

  return updates;
}

/**
 * Formats a Firestore todo document for API response.
 * Converts Firestore Timestamps to ISO 8601 strings.
 *
 * @param {string} id - Todo document ID
 * @param {Object} data - Firestore document data
 * @returns {Object} Formatted todo object for API response
 */
function formatTodoResponse(id, data) {
  return {
    id,
    title: data.title,
    description: data.description || '',
    dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : null,
    priority: data.priority || 'medium',
    category: data.category || '',
    status: data.status || 'pending',
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
  };
}

/**
 * Gets the Firestore CollectionReference for a user's todos subcollection.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @returns {FirebaseFirestore.CollectionReference}
 */
function getTodosRef(db, uid) {
  return db.collection('users').doc(uid).collection('todos');
}

/**
 * Gets the Firestore DocumentReference for a specific todo.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @param {string} todoId - Todo document ID
 * @returns {FirebaseFirestore.DocumentReference}
 */
function getTodoRef(db, uid, todoId) {
  return getTodosRef(db, uid).doc(todoId);
}

/**
 * Retrieves a single todo by ID, scoped to the given user.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @param {string} todoId - Todo document ID
 * @returns {Promise<Object|null>} Formatted todo or null if not found
 */
async function getTodoById(db, uid, todoId) {
  const docRef = getTodoRef(db, uid, todoId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return formatTodoResponse(doc.id, doc.data());
}

/**
 * Creates a new todo in Firestore under the user's subcollection.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @param {Object} data - Todo data
 * @returns {Promise<Object>} Created todo with auto-generated ID and server timestamps
 */
async function createTodo(db, uid, data) {
  const todoDoc = createTodoDocument(data);
  const collectionRef = getTodosRef(db, uid);
  const docRef = await collectionRef.add(todoDoc);

  // Re-fetch to resolve server timestamps
  const createdDoc = await docRef.get();
  return formatTodoResponse(docRef.id, createdDoc.data());
}

/**
 * Updates an existing todo in Firestore.
 * Returns null if the todo does not exist.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @param {string} todoId - Todo document ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object|null>} Updated todo or null if not found
 */
async function updateTodo(db, uid, todoId, data) {
  const docRef = getTodoRef(db, uid, todoId);

  const existingDoc = await docRef.get();
  if (!existingDoc.exists) {
    return null;
  }

  const updates = createTodoUpdateDocument(data);
  await docRef.update(updates);

  // Re-fetch to resolve server timestamps
  const updatedDoc = await docRef.get();
  return formatTodoResponse(todoId, updatedDoc.data());
}

/**
 * Deletes a todo from Firestore.
 * Returns false if the todo does not exist.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @param {string} todoId - Todo document ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteTodo(db, uid, todoId) {
  const docRef = getTodoRef(db, uid, todoId);

  const doc = await docRef.get();
  if (!doc.exists) {
    return false;
  }

  await docRef.delete();
  return true;
}

module.exports = {
  PRIORITY_VALUES,
  STATUS_VALUES,
  TODO_SCHEMA,
  toFirestoreTimestamp,
  createTodoDocument,
  createTodoUpdateDocument,
  formatTodoResponse,
  getTodosRef,
  getTodoRef,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
};
