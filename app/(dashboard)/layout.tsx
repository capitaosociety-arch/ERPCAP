import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '../../lib/prisma';
import DashboardContent from '../../components/DashboardContent';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Fetch dbUser to ensure real-time granular permission toggles
  const dbUser = await prisma.user.findUnique({
    where: { id: (session.user as any)?.id },
    omit: { password: true }
  });

  // Um JWT válido não basta: o usuário precisa continuar existindo e ativo.
  if (!dbUser || !dbUser.isActive) {
    redirect('/login');
  }

  return (
    <DashboardContent user={dbUser}>
      {children}
    </DashboardContent>
  );
}
