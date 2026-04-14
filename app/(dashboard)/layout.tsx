import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

import { prisma } from '../../lib/prisma';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Fetch dbUser to ensure real-time granular permission toggles instead of stale JWT cache
  const dbUser = await prisma.user.findUnique({
    where: { id: (session.user as any)?.id }
  });

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans">
      <Sidebar user={dbUser || session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar user={dbUser || session.user} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20">
          {children}
        </main>
      </div>
    </div>
  );
}
