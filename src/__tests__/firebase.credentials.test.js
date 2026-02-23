/**
 * Firebase Admin SDK Credential Verification Tests
 *
 * Tests the credential validation and normalization functions
 * in src/config/firebase.js to ensure proper handling of:
 * - Missing environment variables
 * - Invalid JSON
 * - Missing required fields
 * - Private key format issues (escaped vs actual newlines)
 * - Client email format validation
 * - Service account type validation
 */

'use strict';

// We test the exported helper functions directly without initializing Firebase
jest.mock('firebase-admin', () => {
  const mockApp = { name: '[DEFAULT]' };
  const mockAuth = {
    getUser: jest.fn(),
  };
  const mockFirestore = jest.fn(() => ({
    settings: jest.fn(),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
      })),
    })),
  }));

  return {
    apps: [],
    initializeApp: jest.fn(() => mockApp),
    auth: jest.fn(() => mockAuth),
    firestore: mockFirestore,
    credential: {
      cert: jest.fn((sa) => ({ type: 'cert', serviceAccount: sa })),
    },
  };
});

const {
  normalizeServiceAccount,
  validateServiceAccount,
} = require('../config/firebase');

describe('normalizeServiceAccount', () => {
  it('should replace escaped newlines with actual newlines in private_key', () => {
    const input = {
      private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkq\\n-----END PRIVATE KEY-----\\n',
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
    };

    const result = normalizeServiceAccount(input);

    expect(result.private_key).toContain('\n');
    expect(result.private_key).not.toContain('\\n');
    expect(result.private_key).toBe(
      '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkq\n-----END PRIVATE KEY-----\n'
    );
  });

  it('should not modify private_key that already has actual newlines', () => {
    const input = {
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkq\n-----END PRIVATE KEY-----\n',
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
    };

    const result = normalizeServiceAccount(input);

    expect(result.private_key).toBe(input.private_key);
  });

  it('should not modify other fields', () => {
    const input = {
      private_key: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n',
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      type: 'service_account',
    };

    const result = normalizeServiceAccount(input);

    expect(result.project_id).toBe('test-project');
    expect(result.client_email).toBe('test@test-project.iam.gserviceaccount.com');
    expect(result.type).toBe('service_account');
  });

  it('should handle missing private_key gracefully', () => {
    const input = {
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
    };

    const result = normalizeServiceAccount(input);

    expect(result.private_key).toBeUndefined();
  });

  it('should return a new object (not mutate the original)', () => {
    const input = {
      private_key: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n',
      project_id: 'test-project',
    };

    const result = normalizeServiceAccount(input);

    // Original should be unchanged
    expect(input.private_key).toContain('\\n');
    // Result should have actual newlines
    expect(result.private_key).not.toContain('\\n');
  });
});

describe('validateServiceAccount', () => {
  const validServiceAccount = {
    type: 'service_account',
    project_id: 'my-firebase-project',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC\n-----END PRIVATE KEY-----\n',
    client_email: 'firebase-adminsdk-abc@my-firebase-project.iam.gserviceaccount.com',
    private_key_id: 'key123',
  };

  it('should not throw for a valid service account', () => {
    expect(() => validateServiceAccount(validServiceAccount)).not.toThrow();
  });

  it('should throw if type is missing', () => {
    const sa = { ...validServiceAccount, type: undefined };
    expect(() => validateServiceAccount(sa)).toThrow("missing required field: 'type'");
  });

  it('should throw if project_id is missing', () => {
    const sa = { ...validServiceAccount, project_id: undefined };
    expect(() => validateServiceAccount(sa)).toThrow("missing required field: 'project_id'");
  });

  it('should throw if private_key is missing', () => {
    const sa = { ...validServiceAccount, private_key: undefined };
    expect(() => validateServiceAccount(sa)).toThrow("missing required field: 'private_key'");
  });

  it('should throw if client_email is missing', () => {
    const sa = { ...validServiceAccount, client_email: undefined };
    expect(() => validateServiceAccount(sa)).toThrow("missing required field: 'client_email'");
  });

  it('should throw if type is not service_account', () => {
    const sa = { ...validServiceAccount, type: 'user_account' };
    expect(() => validateServiceAccount(sa)).toThrow("invalid 'type' field");
  });

  it('should throw if private_key is missing BEGIN header', () => {
    const sa = {
      ...validServiceAccount,
      private_key: 'MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEA\n-----END PRIVATE KEY-----\n',
    };
    expect(() => validateServiceAccount(sa)).toThrow('BEGIN PRIVATE KEY');
  });

  it('should throw if private_key is missing END header', () => {
    const sa = {
      ...validServiceAccount,
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEA\n',
    };
    expect(() => validateServiceAccount(sa)).toThrow('END PRIVATE KEY');
  });

  it('should throw if client_email is not a service account email', () => {
    const sa = { ...validServiceAccount, client_email: 'user@gmail.com' };
    expect(() => validateServiceAccount(sa)).toThrow('iam.gserviceaccount.com');
  });

  it('should throw if client_email is a regular domain email', () => {
    const sa = { ...validServiceAccount, client_email: 'admin@mycompany.com' };
    expect(() => validateServiceAccount(sa)).toThrow('iam.gserviceaccount.com');
  });

  it('should accept valid service account email formats', () => {
    const validEmails = [
      'firebase-adminsdk-abc@my-project.iam.gserviceaccount.com',
      'my-service@project-123.iam.gserviceaccount.com',
      'svc@test-project-456.iam.gserviceaccount.com',
    ];

    validEmails.forEach((email) => {
      const sa = { ...validServiceAccount, client_email: email };
      expect(() => validateServiceAccount(sa)).not.toThrow();
    });
  });

  it('should throw if project_id is an empty string', () => {
    const sa = { ...validServiceAccount, project_id: '' };
    expect(() => validateServiceAccount(sa)).toThrow("missing required field: 'project_id'");
  });

  it('should throw if project_id is whitespace only', () => {
    const sa = { ...validServiceAccount, project_id: '   ' };
    expect(() => validateServiceAccount(sa)).toThrow('project_id must be a non-empty string');
  });
});
