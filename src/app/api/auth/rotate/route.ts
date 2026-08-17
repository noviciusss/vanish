import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, signSessionToken } from '@/lib/jwt';
import { rotateIdentity } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('anon_session')?.value;
    let oldId = '';
    if (token) {
      const payload = verifySessionToken(token);
      if (payload?.identity_id) {
        oldId = payload.identity_id;
      }
    }

    const newIdentityId = await rotateIdentity(oldId);
    const newToken = signSessionToken(newIdentityId, false);

    const response = NextResponse.json({
      identity_id: newIdentityId,
      is_fixed: false,
      tags: [],
      message: 'Identity rotated successfully. All previous associations deleted.',
    });

    response.cookies.set('anon_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Rotate identity failed:', error);
    return NextResponse.json({ error: 'Failed to rotate identity' }, { status: 500 });
  }
}
