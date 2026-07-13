import { NextResponse } from 'next/server';

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return NextResponse.json({
        access_token: "talentscan_session_token_123",
        token_type: "bearer"
      });
    }

    return NextResponse.json(
      { detail: "Invalid username or password" },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: "Invalid request payload" },
      { status: 400 }
    );
  }
}
