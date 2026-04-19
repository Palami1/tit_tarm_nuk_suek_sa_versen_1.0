'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

/* ── floating emoji particles ── */
const EMOJIS = ['🎓', '📋', '✨', '⭐', '🚀', '💡', '🏆', '📊', '🎯', '💼'];

interface Particle {
  id: number;
  emoji: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
}

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [particles, setParticles] = useState<Particle[]>([]);
  const router = useRouter();

  // Generate floating particles on client only (avoid SSR mismatch)
  useEffect(() => {
    const generated: Particle[] = Array.from({ length: 14 }, (_, i) => ({
      id: i,
      emoji: EMOJIS[i % EMOJIS.length],
      left: Math.random() * 90 + 5,
      delay: Math.random() * 8,
      duration: Math.random() * 8 + 10,
      size: Math.random() * 0.8 + 0.9,
    }));
    setParticles(generated);
  }, []);

  // Auto-redirect if already logged in
  useEffect(() => {
    let isMounted = true;

    const timeout = setTimeout(() => {
      if (isMounted) setCheckingSession(false);
    }, 500);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDocs(query(
            collection(db, 'users'),
            where('email', '==', user.email),
            limit(1)
          ));
          if (!userDoc.empty) {
            const role = userDoc.docs[0].data().role;
            router.replace(role === 'admin' ? '/admin' : '/dashboard');
          } else {
            router.replace('/dashboard');
          }
        } catch (err) {
          console.error('Session check error:', err);
          if (isMounted) setCheckingSession(false);
        }
      } else {
        if (isMounted) setCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDocs(query(
        collection(db, 'users'),
        where('email', '==', user.email),
        limit(1)
      ));

      if (!userDoc.empty) {
        const role = userDoc.docs[0].data().role;
        router.replace(role === 'admin' ? '/admin' : '/dashboard');
      } else {
        router.replace('/dashboard');
      }
    } catch (err: any) {
      setError('ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-pink-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-bold animate-pulse">ກຳລັງກວດສອບລະບົບ...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Particle float keyframe */}
      <style>{`
        @keyframes particle-float {
          0%   { transform: translateY(100vh) scale(0) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 0.6; }
          100% { transform: translateY(-12vh) scale(1) rotate(360deg); opacity: 0; }
        }
        .particle {
          position: fixed;
          pointer-events: none;
          animation: particle-float linear infinite;
          z-index: 0;
          user-select: none;
        }
      `}</style>

      {/* Floating emoji particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: `${p.left}%`,
            bottom: '-5vh',
            fontSize: `${p.size}rem`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}

      <div className="bg-gradient-to-br from-red-50 via-white to-pink-50 min-h-screen flex items-center justify-center p-4 relative">
        <main className="w-full max-w-md z-10">

          {/* Card with bounce-in animation */}
          <section className="animate-bounce-in bg-white rounded-[2.5rem] border border-red-50 card-shadow card-hover overflow-hidden p-8 md:p-12 text-center">

            {/* Logo with ping ring */}
            <div className="mb-8 flex flex-col items-center">
              <div className="relative inline-block">
                <div className="absolute inset-0 rounded-full bg-red-100 animate-ping opacity-25 scale-150" />
                <img
                  src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png"
                  alt="LTC Logo"
                  className="logo-bounce relative h-20 w-auto object-contain logo-style cursor-pointer"
                />
              </div>
            </div>

            {/* Header */}
            <header className="mb-8 animate-slide-up stagger-1">
              <h1 className="text-2xl font-bold text-[#1a2b4b] mb-2">🎓 Intern Login</h1>
              <p className="text-sm text-gray-400">ກະລຸນາເຂົ້າສູ່ລະບົບເພື່ອດຳເນີນການຕໍ່</p>
            </header>

            <form onSubmit={handleLogin} className="space-y-5 text-left">

              {/* Email */}
              <div className="space-y-1.5 animate-slide-up stagger-2">
                <label className="block text-sm font-bold text-gray-700 ml-1" htmlFor="email">
                  📧 Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </span>
                  <input
                    className="fun-input block w-full pl-12 pr-4 py-3.5 border border-gray-100 bg-gray-50 rounded-2xl text-sm transition-all outline-none hover:border-red-200"
                    id="email"
                    placeholder="Enter your email"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5 animate-slide-up stagger-3">
                <label className="block text-sm font-bold text-gray-700 ml-1" htmlFor="password">
                  🔒 Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </span>
                  <input
                    className="fun-input block w-full pl-12 pr-12 py-3.5 border border-gray-100 bg-gray-50 rounded-2xl text-sm transition-all outline-none hover:border-red-200"
                    id="password"
                    placeholder="••••••"
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="animate-pop-in text-red-500 text-xs text-center bg-red-50 rounded-xl py-2 px-4">
                  ⚠️ {error}
                </p>
              )}

              {/* Submit */}
              <div className="pt-4 animate-slide-up stagger-4">
                <button
                  className="btn-ripple w-full py-4 px-4 btn-shimmer text-white font-bold rounded-2xl shadow-lg shadow-red-200 hover:shadow-red-300 active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ກຳລັງເຂົ້າສູ່ລະບົບ...
                    </>
                  ) : (
                    '🚀 ເຂົ້າສູ່ລະບົບ'
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center py-4 animate-slide-up stagger-5">
                <div className="flex-grow border-t border-gray-100" />
                <span className="flex-shrink mx-4 text-gray-400 text-xs font-bold uppercase tracking-widest">ຫຼື</span>
                <div className="flex-grow border-t border-gray-100" />
              </div>

              {/* Register */}
              <Link
                href="/register"
                className="hover-bounce block w-full py-4 px-4 bg-white border-2 border-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2 animate-slide-up stagger-5"
              >
                <span>📝 ລົງທະບຽນໃໝ່</span>
              </Link>
            </form>

            <footer className="mt-10 pt-6 border-t border-gray-50 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                © 2026 LTC Intern Tracking System ✨
              </p>
            </footer>
          </section>
        </main>
      </div>
    </>
  );
};

export default LoginPage;
