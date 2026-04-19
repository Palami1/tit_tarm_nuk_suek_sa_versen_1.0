import { Suspense } from 'react';
import InternClientPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#0b0e14]"><div className="text-gray-500 font-mono text-xs uppercase tracking-widest animate-pulse">Initializing System...</div></div>}>
      <InternClientPage />
    </Suspense>
  );
}
