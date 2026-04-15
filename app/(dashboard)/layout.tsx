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
    where: { id: (session.user as any)?.id }
  });

  return (
    <DashboardContent user={dbUser || session.user}>
      {children}
    </DashboardContent>
  );
}
