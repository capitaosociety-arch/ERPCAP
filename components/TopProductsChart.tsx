'use client';
import { useEffect, useState } from 'react';
import { getTopProducts } from '../app/actions/dashboard';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function TopProductsChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopProducts().then(chartData => {
      setData(chartData);
      setLoading(false);
    });
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-6 mb-8 h-full min-h-[400px] overflow-hidden">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Mais Vendidos</h2>
        <p className="text-gray-500 text-xs md:text-sm">Volume total por produto</p>
      </div>

      <div className="h-64 w-full relative">
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 animate-pulse">
            <div className="w-40 h-40 rounded-full border-[12px] border-gray-100 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
            </div>
            <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="h-4 w-16 bg-gray-100 rounded-full"></div>)}
            </div>
          </div>
        ) : data.length === 0 ? (
           <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 border-2 border-dashed border-gray-100 rounded-xl">
             <p className="font-bold text-sm text-slate-500 text-center">Nenhum produto vendido ainda.</p>
           </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={8}
                dataKey="value"
                labelLine={false}
                animationDuration={1500}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', padding: '12px' }}
                formatter={(value: any) => [`${value} unidades`, 'Vendido']}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 500 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
