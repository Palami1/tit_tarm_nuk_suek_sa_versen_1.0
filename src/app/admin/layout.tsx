import React from 'react';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import MobileNav from '@/components/MobileNav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e14] text-[#e6edf3]">
      <Sidebar role="admin" />
      
      <main className="flex-1 relative overflow-y-auto focus:outline-none pb-20 md:pb-0 font-lao">
        <MobileHeader theme="dark" />
        
        <div className="p-4 md:p-10">
          {children}
        </div>

        <MobileNav role="admin" />
      </main>
    </div>
  );
}
