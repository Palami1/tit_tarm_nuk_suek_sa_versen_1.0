import React from 'react';

const MobileHeader: React.FC = () => {
  return (
    <header className="md:hidden bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-20 border-b border-gray-100">
      <img
        src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png"
        alt="LTC Logo"
        className="h-10 w-auto object-contain"
      />
      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
        </svg>
      </div>
    </header>
  );
};

export default MobileHeader;
