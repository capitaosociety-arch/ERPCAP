import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '../../../lib/prisma';
import OcupacaoClient from './OcupacaoClient';
import { getOcupacaoReport, getFaixasPreco } from '../../actions/ocupacao';

export default async function OcupacaoPage() {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session || !session.user || !session.user.id) redirect('/login');

  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) {
    redirect('/dashboard');
  }

  const [initial, faixasRes] = await Promise.all([
    getOcupacaoReport({ periodo: '30d', campo: 'ambos' }),
    getFaixasPreco()
  ]);

  return (
    <OcupacaoClient
      initialReport={initial.success ? initial.report ?? null : null}
      initialError={initial.success ? undefined : initial.error}
      faixas={faixasRes.success ? faixasRes.faixas ?? [] : []}
      isAdmin={dbUser.role === 'ADMIN'}
    />
  );
}
