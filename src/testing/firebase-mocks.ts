/**
 * Test fixtures for Firebase types — only the fields actually consumed by
 * code under test. Keep these intentionally minimal.
 */

import type { Database } from '../app/core/models/models';

export interface FakeUserOptions {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  emailVerified?: boolean;
}

export function makeFakeUser(overrides: FakeUserOptions = {}) {
  return {
    uid: overrides.uid ?? 'user-123',
    email: overrides.email === undefined ? 'test@example.com' : overrides.email,
    displayName: overrides.displayName === undefined ? 'Loja Teste' : overrides.displayName,
    emailVerified: overrides.emailVerified ?? true,
    reload: jest.fn().mockResolvedValue(undefined),
    getIdToken: jest.fn().mockResolvedValue('fake-token'),
  };
}

export interface FakeSnapshotOptions {
  exists?: boolean;
  fromCache?: boolean;
  hasPendingWrites?: boolean;
}

export function makeFakeSnapshot(data: unknown, opts: FakeSnapshotOptions = {}) {
  const { exists = true, fromCache = false, hasPendingWrites = false } = opts;
  return {
    exists: () => exists,
    data: () => data,
    metadata: { fromCache, hasPendingWrites },
  };
}

export function makeFakeDatabase(overrides: Partial<Database> = {}): Database {
  return {
    purchases: [],
    sales: [],
    settings: {
      defaultMlFee: 0.12,
      yellowAlertDays: 25,
      redAlertDays: 30,
      minimumMargin: 0.10,
      lowStockAlert: 1,
      defaultShipping: 0,
      defaultChannel: 'Mercado Livre',
      categories: ['Eletrônicos', 'Outros'],
      categoryColors: {},
      suppliers: ['Amazon BR', 'Outro'],
      supplierColors: {},
      channels: ['Mercado Livre', 'Outro'],
      channelColors: {},
    },
    metadata: { versao: '1.0.0', ultimaAtualizacao: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}
