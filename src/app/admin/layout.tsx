import React from 'react';
import Sidebar from '@/components/Sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e14] text-[#e6edf3]">
      <Sidebar role="admin" />
      
      <main className="flex-1 relative overflow-y-auto focus:outline-none p-10 font-lao">
        {children}
      </main>
    </div>
  );
}
