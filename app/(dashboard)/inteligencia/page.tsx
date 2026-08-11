import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '../../../lib/prisma';
import InteligenciaClient from './InteligenciaClient';
import { getIntelligenceReport } from '../../actions/inteligencia';
import { isAIEnabled } from '../../../lib/ai/provider';

export default async function InteligenciaPage() {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session || !session.user || !session.user.id) redirect('/login');

    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) {
        redirect('/dashboard');
    }

    const initial = await getIntelligenceReport('30d');

    const copilotEnabled = ['1', 'true', 'yes'].includes((process.env.COPILOT_ENABLED || '').toLowerCase());

    return (
        <InteligenciaClient
            initialReport={initial.success ? initial.report ?? null : null}
            initialError={initial.success ? undefined : initial.error}
            copilot={{
                enabled: copilotEnabled,
                hasAI: isAIEnabled(),
                canUse: dbUser.role === 'ADMIN' || dbUser.permCopilot
            }}
        />
    );
}
