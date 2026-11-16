'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import MobileNav from '@/components/MobileNav';

export default function SuperAdminLayout({
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
          const role = userSnap.data()?.role;
          if (role === 'superadmin') {
            setAuthorized(true);
          } else {
            // Not superadmin -> redirect to appropriate portal
            router.replace(role === 'admin' ? '/admin' : '/dashboard');
          }
        } else {
          router.replace('/login');
        }
      } catch (err) {
        console.error('Superadmin guard check error:', err);
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (!authorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b0e14] text-white font-lao">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-xs font-mono tracking-widest uppercase">
            Verifying Super Admin Authorization...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e14] text-[#e6edf3]">
      <Sidebar role="superadmin" />
      
      <main className="flex-1 relative overflow-y-auto focus:outline-none pb-20 md:pb-0 font-lao">
        <MobileHeader theme="dark" />
        
        <div className="p-4 md:p-10 max-w-7xl mx-auto">
          {children}
        </div>

        <MobileNav role="superadmin" />
      </main>
    </div>
  );
}
