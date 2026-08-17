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
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const profile = await prisma.profile.findUnique({
      where: { identityId: payload.identity_id },
    });

    return NextResponse.json({
      identity_id: payload.identity_id,
      tags: profile?.tags || [],
    });
  } catch (error) {
    console.error('Fetch profile failed:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
