import React from 'react';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import MobileNav from '@/components/MobileNav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#fcfcfd]">
      <Sidebar role="user" />
      
      <main className="flex-1 relative overflow-y-auto focus:outline-none bg-gray-50/50 pb-20 md:pb-0 font-lao">
        <MobileHeader />
        
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
          {children}
        </div>

        <MobileNav />
      </main>
    </div>
  );
}
