'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import MobileNav from '@/components/MobileNav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          const role = data?.role || 'intern';
          const status = data?.status || 'pending';

          // Admin or Super Admin should not be in Intern Dashboard
          if (role === 'admin' || role === 'superadmin') {
            router.replace('/admin');
            return;
          }

          // Intern must be approved to access Dashboard
          if (status !== 'approved') {
            router.replace('/pending');
            return;
          }

          setAuthorized(true);
        } else {
          router.replace('/pending');
        }
      } catch (err) {
        console.error('Intern guard check error:', err);
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (!authorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 font-lao">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-xs">ກຳລັງກວດສອບສິດການເຂົ້າເຖິງ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#fcfcfd]">
      <Sidebar role="user" />
      
      <main className="flex-1 relative overflow-y-auto focus:outline-none bg-gray-50/50 pb-20 md:pb-0 font-lao">
        <MobileHeader />
        
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
          {children}
        </div>

        <MobileNav role="user" />
      </main>
    </div>
  );
}
