import { NextResponse } from 'next/server';
import { runRentalAudit } from '../../../../lib/rental-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Auditoria nao configurada.' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Nao autorizado.' }, { status: 401 });
  }
  try {
    const result = await runRentalAudit('CRON');
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('RENTAL_AUDIT_CRON_ERROR', error);
    return NextResponse.json({ ok: false, error: 'Falha na auditoria.' }, { status: 500 });
  }
}
