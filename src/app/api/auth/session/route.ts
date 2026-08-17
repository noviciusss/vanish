import { NextRequest, NextResponse } from 'next/server';
import { createAnonymousIdentity } from '@/lib/identity';
import { signSessionToken, verifySessionToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const existingToken = req.cookies.get('anon_session')?.value;

    if (existingToken) {
      const payload = verifySessionToken(existingToken);
      if (payload?.identity_id) {
        const existing = await prisma.identity.findUnique({
          where: { id: payload.identity_id },
          include: { profile: true },
        });

        if (existing) {
          return NextResponse.json({
            identity_id: existing.id,
            is_fixed: existing.isFixed,
            tags: existing.profile?.tags || [],
            created_at: existing.createdAt,
          });
        }
      }
    }

    // Create fresh anonymous identity
    const identityId = await createAnonymousIdentity();
    const token = signSessionToken(identityId, false);

    const response = NextResponse.json({
      identity_id: identityId,
      is_fixed: false,
      tags: [],
      created_at: new Date().toISOString(),
    });

    response.cookies.set('anon_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session creation failed:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
