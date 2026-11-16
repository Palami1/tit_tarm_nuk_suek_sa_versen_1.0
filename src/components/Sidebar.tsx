'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface SidebarProps {
  role: 'user' | 'admin' | 'superadmin';
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
      name: 'ໜ້າຫຼັກ (ລົງເວລາ)',
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
      name: 'ລາຍງານຜົນ & ເກຣດ',
      href: '/dashboard/reports',
      emoji: '📊',
      icon: (
        <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ຂໍລາພັກ',
      href: '/dashboard/leave',
      emoji: '🏖️',
      icon: (
        <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ໂປຣໄຟລ໌ຂອງຂ້ອຍ',
      href: '/dashboard/profile',
      emoji: '👤',
      icon: (
        <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2" />
        </svg>
      ),
    },
  ];

  const adminLinks = [
    {
      name: 'Dashboard (ທີມ)',
      href: '/admin',
      emoji: '📈',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ນັກສຶກສາໃນທີມ',
      href: '/admin/interns',
      emoji: '👥',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ກວດລາຍງານປະຈຳວັນ',
      href: '/admin/reports',
      emoji: '📋',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ອະນຸມັດລາພັກ',
      href: '/admin/leave',
      emoji: '🏖️',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="2" />
        </svg>
      ),
    },
  ];

  const superadminLinks = [
    {
      name: 'Overview Dashboard',
      href: '/admin',
      emoji: '📈',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ອະນຸມັດ Intern ໃໝ່',
      href: '/superadmin/approvals',
      emoji: '🛡️',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ນັກສຶກສາທັງໝົດ',
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
    {
      name: 'ອະນຸມັດລາພັກ',
      href: '/admin/leave',
      emoji: '🏖️',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ຈັດການພະແນກ',
      href: '/superadmin/departments',
      emoji: '🏢',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ຈັດການ Admin',
      href: '/superadmin/admins',
      emoji: '👔',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'ຕັ້ງຄ່າລະບົບ & GPS',
      href: '/superadmin/settings',
      emoji: '⚙️',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2" />
        </svg>
      ),
    },
    {
      name: 'Audit Logs',
      href: '/superadmin/audit-logs',
      emoji: '📜',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" />
        </svg>
      ),
    },
  ];

  let links = userLinks;
  if (role === 'superadmin') links = superadminLinks;
  else if (role === 'admin') links = adminLinks;

  const isDark = role === 'admin' || role === 'superadmin';

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
            {role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Admin Team' : 'Intern Portal'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-6 space-y-2 mt-2 overflow-y-auto">
        {links.map((link, idx) => {
          const isActive = pathname === link.href;
          const staggerClass = `stagger-${idx + 1}`;
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`animate-slide-up ${staggerClass} flex items-center px-4 py-3 rounded-xl transition-all duration-200 font-bold group text-sm ${
                isActive
                  ? isDark
                    ? 'bg-gradient-to-r from-[#e11d48] to-[#9f1239] text-white sidebar-active-glow'
                    : 'bg-red-50 text-red-600 sidebar-active-glow'
                  : isDark
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800/50 hover:translate-x-1'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-red-600 hover:translate-x-1'
              }`}
            >
              <span
                className={`mr-2 text-base transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'group-hover:scale-125'
                }`}
              >
                {link.emoji}
              </span>
              {link.icon}
              <span className="truncate">{link.name}</span>
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
              ? 'text-gray-400 hover:text-red-500 hover:bg-gray-800/50'
              : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
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
