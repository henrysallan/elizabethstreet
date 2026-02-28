import { NextResponse } from 'next/server';

const PASSWORD = 'omar';

export async function POST(request: Request) {
  const { password } = await request.json();

  if (password === PASSWORD) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set('authed', '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    return res;
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
