// app/api/data/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const res = await fetch(`${backendUrl}/api/data`);
  const data = await res.json();

  return NextResponse.json(data);
}