'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface SidebarProps {
  role: 'user' | 'admin';
}

const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const userLinks = [
    {
      name: 'ໜ້າຫຼັກ',
      href: '/dashboard',
      emoji: '🏠',
      icon: (
        <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ປະຫວັດການລົງເວລາ',
      href: '/dashboard/history',
      emoji: '🕐',
      icon: (
        <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ລາຍງານຜົນ',
      href: '/dashboard/reports',
      emoji: '📊',
      icon: (
        <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2" />
        </svg>
      ),
    },
  ];

  const adminLinks = [
    {
      name: 'Dashboard',
      href: '/admin',
      emoji: '📈',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ນັກສຶກສາຝຶກງານ',
      href: '/admin/interns',
      emoji: '👥',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ລາຍງານທັງໝົດ',
      href: '/admin/reports',
      emoji: '📋',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2" />
        </svg>
      ),
    },
  ];

  const links = role === 'user' ? userLinks : adminLinks;
  const isDark = role === 'admin';

  return (
    <aside
      className={`animate-slide-in-left hidden md:flex md:w-72 md:flex-col border-r ${
        isDark ? 'bg-[#0d1117] border-gray-800' : 'bg-white border-gray-100'
      } h-full flex-shrink-0`}
    >
      {/* Logo */}
      <div className="p-8 pb-6 flex items-center space-x-4">
        <img
          alt="LTC Logo"
          className={`h-12 w-auto hover-pop cursor-pointer ${isDark ? 'brightness-125' : 'logo-glow'}`}
          src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png"
        />
        <div>
          <div className="text-[10px] text-gray-500 font-black uppercase tracking-wider leading-none">
            Lao Telecom
          </div>
          <div className="text-[11px] font-bold text-red-500 mt-1 uppercase leading-none">
            {role === 'admin' ? 'Admin Control' : 'Intern Portal'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-6 space-y-3 mt-4">
        {links.map((link, idx) => {
          const isActive = pathname === link.href;
          const staggerClass = `stagger-${idx + 1}`;
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`animate-slide-up ${staggerClass} flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 font-bold group ${
                isActive
                  ? isDark
                    ? 'bg-gradient-to-r from-[#e11d48] to-[#9f1239] text-white sidebar-active-glow'
                    : 'bg-red-50 text-red-600 sidebar-active-glow'
                  : isDark
                    ? 'text-gray-500 hover:text-white hover:bg-gray-800/50 hover:translate-x-1'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-red-600 hover:translate-x-1'
              }`}
            >
              <span
                className={`mr-1 text-base transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'group-hover:scale-125'
                }`}
              >
                {link.emoji}
              </span>
              {link.icon}
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className={`p-6 border-t ${isDark ? 'border-gray-800' : 'border-gray-50'}`}>
        <button
          onClick={handleLogout}
          className={`hover-wiggle flex w-full items-center px-4 py-3 text-sm font-bold transition-all rounded-xl ${
            isDark
              ? 'text-gray-500 hover:text-red-500 hover:bg-gray-800/50'
              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7" strokeWidth="2" />
          </svg>
          <span>{isDark ? '🚪 Logout' : '🚪 ອອກຈາກລະບົບ'}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
