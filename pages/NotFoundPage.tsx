
import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-center px-4">
      <img 
        src="https://picsum.photos/seed/404page/400/300" 
        alt="혼란스러워하는 로봇 또는 추상적인 404 시각 자료" 
        className="w-64 h-auto mb-8 rounded-lg shadow-lg"
      />
      <h1 className="text-6xl font-bold text-primary-600 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-700 mb-3">이런! 페이지를 찾을 수 없습니다.</h2>
      <p className="text-gray-500 mb-8 max-w-md">
        찾고 계신 페이지가 존재하지 않거나 이동된 것 같습니다.
        걱정 마세요, 다시 안내해 드리겠습니다.
      </p>
      <Link
        to="/"
        className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 transition-colors duration-150 shadow-md hover:shadow-lg"
      >
        홈페이지로 이동
      </Link>
    </div>
  );
};

export default NotFoundPage;