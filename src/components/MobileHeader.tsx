'use client';

import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const MobileHeader: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme = 'light' }) => {
  const router = useRouter();
  const isDark = theme === 'dark';

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <header className={`md:hidden ${isDark ? 'bg-[#161b22] border-gray-800' : 'bg-white border-gray-100'} px-6 py-4 flex items-center justify-between sticky top-0 z-20 border-b`}>
      <img
        src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png"
        alt="LTC Logo"
        className={`h-10 w-auto object-contain ${isDark ? 'brightness-125' : ''}`}
      />
      <div className="flex items-center space-x-3">
        <button 
          onClick={handleLogout}
          className={`${isDark ? 'text-gray-500 hover:text-red-500' : 'text-gray-400 hover:text-red-600'} p-2 transition-colors`}
          title="Logout"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7" strokeWidth="2" />
          </svg>
        </button>
        <div className={`h-8 w-8 rounded-full ${isDark ? 'bg-red-900/50' : 'bg-red-100'} flex items-center justify-center`}>
          <svg className={`w-4 h-4 ${isDark ? 'text-red-500' : 'text-red-600'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
          </svg>
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
