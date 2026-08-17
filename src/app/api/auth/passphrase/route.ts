import { NextRequest, NextResponse } from 'next/server';
import { deriveFixedIdentity } from '@/lib/identity';
import { signSessionToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import argon2 from 'argon2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { passphrase } = body;

    if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < 6) {
      return NextResponse.json(
        { error: 'Passphrase must be at least 6 characters long' },
        { status: 400 }
      );
    }

    const { identityId, passphraseHash } = await deriveFixedIdentity(passphrase.trim());

    // Check if this fixed identity already exists
    let identity = await prisma.identity.findUnique({
      where: { id: identityId },
      include: { profile: true },
    });

    if (!identity) {
      // Create new fixed identity
      identity = await prisma.identity.create({
        data: {
          id: identityId,
          isFixed: true,
          passphraseHash,
          profile: {
            create: {
              tags: [],
            },
          },
        },
        include: { profile: true },
      });
    } else {
      // Verify passphrase hash if present
      if (identity.passphraseHash) {
        const isValid = await argon2.verify(identity.passphraseHash, passphrase.trim());
        if (!isValid) {
          return NextResponse.json({ error: 'Invalid passphrase' }, { status: 403 });
        }
      }
    }

    const token = signSessionToken(identity.id, true);

    const response = NextResponse.json({
      identity_id: identity.id,
      is_fixed: true,
      tags: identity.profile?.tags || [],
      message: 'Fixed identity successfully derived/recovered.',
    });

    response.cookies.set('anon_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days for fixed
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Fixed passphrase error:', error);
    return NextResponse.json({ error: 'Failed to process passphrase' }, { status: 500 });
  }
}
