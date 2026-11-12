import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '../../../lib/prisma';
import InteligenciaClient from './InteligenciaClient';
import { getIntelligenceReport } from '../../actions/inteligencia';
import { isAIEnabled } from '../../../lib/ai/provider';
import { currentCuiabaMonth } from '../../../lib/official-financials';

export default async function InteligenciaPage() {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session || !session.user || !session.user.id) redirect('/login');

    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) {
        redirect('/dashboard');
    }

    const initialPeriod = currentCuiabaMonth();
    const initialRegime = 'competence' as const;
    const initial = await getIntelligenceReport(initialPeriod, initialRegime);

    const copilotEnabled = ['1', 'true', 'yes'].includes((process.env.COPILOT_ENABLED || '').toLowerCase());

    return (
        <InteligenciaClient
            initialReport={initial.success ? initial.report ?? null : null}
            initialError={initial.success ? undefined : initial.error}
            initialPeriod={initialPeriod}
            initialRegime={initialRegime}
            canManageCosts={dbUser.role === 'ADMIN' || dbUser.permFinance}
            copilot={{
                enabled: copilotEnabled,
                hasAI: isAIEnabled(),
                canUse: dbUser.role === 'ADMIN' || dbUser.permCopilot
            }}
        />
    );
}
