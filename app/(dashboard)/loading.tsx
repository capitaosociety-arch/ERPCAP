import React from 'react';

export default function Loading() {
  return (
    <div className="w-full h-full min-h-[60vh] flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-blue-100 border-t-mrts-blue rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <img src="/logo.svg" alt="Loading" className="w-8 h-8 opacity-20" />
        </div>
      </div>
      <p className="mt-4 text-slate-400 font-medium animate-pulse">Carregando dados...</p>
      
      {/* Skeleton placeholders to simulate layout */}
      <div className="w-full mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 opacity-40">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse"></div>
        ))}
      </div>
      <div className="w-full mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 opacity-40">
        <div className="lg:col-span-2 h-64 bg-gray-100 rounded-2xl animate-pulse"></div>
        <div className="lg:col-span-1 h-64 bg-gray-100 rounded-2xl animate-pulse"></div>
      </div>
    </div>
  );
}
