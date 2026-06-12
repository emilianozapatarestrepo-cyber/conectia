// Minimal env vars so the config module loads without crashing in unit tests.
// These values are never used to make real connections in unit tests.
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgres://test:test@localhost:5432/test';
process.env['FIREBASE_PROJECT_ID'] = process.env['FIREBASE_PROJECT_ID'] ?? 'test-project';
process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
