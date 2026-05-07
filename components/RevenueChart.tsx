'use client';
import { useEffect, useState } from 'react';
import { getRevenueData } from '../app/actions/dashboard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function RevenueChart() {
  const [filter, setFilter] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const chartData = await getRevenueData(filter);
      setData(chartData);
      setLoading(false);
    };
    fetchData();
  }, [filter]);

  return (
    <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-6 mb-8 relative overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Gráfico de Faturamento</h2>
          <p className="text-gray-500 text-xs md:text-sm">Consolidado de todas as formas de pagamento</p>
        </div>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block p-2 md:p-3 font-medium outline-none shadow-sm cursor-pointer transition-all hover:bg-gray-100"
        >
          <option value="day">Hoje (Por Hora)</option>
          <option value="week">Última Semana</option>
          <option value="month">Último Mês</option>
          <option value="year">Último Ano</option>
        </select>
      </div>

      <div className="h-72 w-full">
        {loading ? (
          <div className="w-full h-full flex flex-col gap-4 animate-pulse">
            <div className="flex-1 bg-gray-100 rounded-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
            </div>
            <div className="flex justify-between gap-4">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-4 w-12 bg-gray-100 rounded"></div>)}
            </div>
          </div>
        ) : data.length === 0 ? (
           <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 border-2 border-dashed border-gray-100 rounded-xl">
             <p className="font-bold text-lg text-slate-500">Nenhuma venda gerada ainda.</p>
             <p className="text-sm mt-1">Os dados aparecerão aqui conforme as vendas forem realizadas.</p>
           </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} tickFormatter={(value) => `R$${value}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', padding: '16px' }}
                formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'Receita Total']}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '5 5' }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#10b981" 
                strokeWidth={4} 
                fillOpacity={1} 
                fill="url(#colorValue)" 
                activeDot={{ r: 8, fill: '#10b981', stroke: '#fff', strokeWidth: 3 }} 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
