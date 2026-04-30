import { getQuadrasData } from '@/app/actions/quadras';
import QuadrasClient from './QuadrasClient';

export const metadata = {
    title: 'Gestão de Quadras - Capitão Society'
};

export default async function QuadrasPage() {
    const data = await getQuadrasData();

    return <QuadrasClient initialData={data} />;
}
