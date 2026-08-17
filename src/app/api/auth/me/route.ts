import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('anon_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifySessionToken(token);
    if (!payload?.identity_id) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const identity = await prisma.identity.findUnique({
      where: { id: payload.identity_id },
      include: { profile: true },
    });

    if (!identity) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 404 });
    }

    return NextResponse.json({
      identity_id: identity.id,
      is_fixed: identity.isFixed,
      tags: identity.profile?.tags || [],
      created_at: identity.createdAt,
    });
  } catch (error) {
    console.error('Fetch me failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
