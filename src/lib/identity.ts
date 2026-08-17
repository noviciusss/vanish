import { customAlphabet } from 'nanoid';
import argon2 from 'argon2';
import crypto from 'crypto';
import { prisma } from './prisma';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

export function generateRandomIdentityId(): string {
  return `anon_${nanoid()}`;
}

/**
 * Deterministically derive an identity_id from a user's passphrase without storing the plain passphrase.
 * Uses SHA-256 + base36 slice to create a deterministic ID string, and Argon2 for verification hash.
 */
export async function deriveFixedIdentity(passphrase: string): Promise<{
  identityId: string;
  passphraseHash: string;
}> {
  // Deterministic identifier derived from salted passphrase
  const hash = crypto.createHash('sha256').update(`anon_fixed_salt_${passphrase}`).digest('hex');
  const shortCode = hash.substring(0, 7);
  const identityId = `anon_f_${shortCode}`;

  // Argon2 hash for secure verification
  const passphraseHash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
  });

  return { identityId, passphraseHash };
}

/**
 * Create a new random anonymous identity in Postgres
 */
export async function createAnonymousIdentity(): Promise<string> {
  const identityId = generateRandomIdentityId();
  await prisma.identity.create({
    data: {
      id: identityId,
      isFixed: false,
      profile: {
        create: {
          tags: [],
        },
      },
    },
  });
  return identityId;
}

/**
 * Rotate an identity: delete the old identity and create a fresh one.
 * Zero link between old and new identity.
 */
export async function rotateIdentity(oldIdentityId: string): Promise<string> {
  // Check if old identity is fixed or regular
  const existing = await prisma.identity.findUnique({
    where: { id: oldIdentityId },
  });

  // If it's a regular anonymous identity, remove it cleanly (cascades profile & blocks)
  if (existing && !existing.isFixed) {
    try {
      await prisma.identity.delete({
        where: { id: oldIdentityId },
      });
    } catch {
      // ignore if already deleted
    }
  }

  // Create new anonymous identity
  return await createAnonymousIdentity();
}
