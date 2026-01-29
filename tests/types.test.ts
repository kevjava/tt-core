import { TTError, DatabaseError, ValidationError } from '../src/types';

describe('Error Types', () => {
  test('TTError has correct name', () => {
    const error = new TTError('Test error');
    expect(error.name).toBe('TTError');
    expect(error.message).toBe('Test error');
  });

  test('DatabaseError has correct name', () => {
    const error = new DatabaseError('DB error');
    expect(error.name).toBe('DatabaseError');
    expect(error.message).toBe('DB error');
  });

  test('ValidationError has correct name', () => {
    const error = new ValidationError('Validation failed');
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Validation failed');
  });
});
