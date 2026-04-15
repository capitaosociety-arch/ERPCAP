'use client';
import { useEffect, useState } from 'react';
import { getTopProducts } from '../app/actions/dashboard';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#00a8ff', '#00d2d3', '#ff9f43', '#ee5253', '#5f27cd'];

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
    <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-6 mb-8 h-full min-h-[400px]">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Mais Vendidos</h2>
        <p className="text-gray-500 text-xs md:text-sm">Volume total por produto</p>
      </div>

      <div className="h-64 w-full relative">
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mrts-blue mb-4"></div>
            <p className="text-sm font-medium">Buscando popularidade...</p>
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
                paddingAngle={5}
                dataKey="value"
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 25px rgba(0,0,0,0.1)' }}
                formatter={(value: any) => [`${value} unidades`, 'Vendido']}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
