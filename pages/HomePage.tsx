import React from 'react';
import { Link } from 'react-router-dom';
import { CameraIcon, ClipboardListIcon, ChatBubbleLeftRightIcon, DocumentTextIcon } from '../components/Icons'; 
import { useAuth } from '../components/Layout';

interface FeatureCardProps {
  title: string;
  description: string;
  link: string;
  icon: React.ReactNode;
  requiresAuth?: boolean; 
}

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, link, icon, requiresAuth }) => {
  const { currentUser, loadingAuth } = useAuth();
  const isDisabled = requiresAuth && !currentUser && !loadingAuth;

  return (
    <Link to={isDisabled ? '/login' : link} className="block group">
      <div className={`bg-white shadow-lg rounded-xl p-6 flex flex-col items-center text-center h-full transition-all duration-300 ease-in-out ${isDisabled ? 'opacity-60 cursor-default' : 'hover:shadow-xl hover:scale-105'}`}>
        <div className="mb-4 text-primary-500">{icon}</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm flex-grow">{description}</p>
        {isDisabled ? (
            <span className="mt-4 text-sm text-red-500 font-medium">로그인 필요</span>
        ) : (
            <span className="mt-4 text-sm text-primary-600 font-medium group-hover:underline">기능 살펴보기 &rarr;</span>
        )}
      </div>
    </Link>
  );
};

const HomePage: React.FC = () => {
  const features = [
    {
      title: '사진 위험 분석',
      description: '작업 현장 사진을 업로드하면 AI가 잠재적 위험을 분석하고 개선안을 제안하며 관련 규정을 안내합니다.',
      link: '/photo-analysis',
      icon: <CameraIcon className="w-12 h-12" />,
      requiresAuth: false,
    },
    {
      title: 'AI 위험성 평가',
      description: '사진을 업로드하고 공정 또는 장비명을 명시하여 포괄적인 위험성 평가표를 생성합니다.',
      link: '/risk-assessment',
      icon: <ClipboardListIcon className="w-12 h-12" />,
      requiresAuth: true,
    },
    {
      title: 'AI 안전 챗봇',
      description: '산업 안전 및 보건 관련 질문을 하세요. AI가 법규 및 정보를 기반으로 답변해 드립니다.',
      link: '/ai-qa',
      icon: <ChatBubbleLeftRightIcon className="w-12 h-12" />,
      requiresAuth: true,
    },
    {
      title: '게시판',
      description: '안전 및 보건에 대한 지식, 경험, 자료를 공유하고, 질문하며, 구인구직 정보를 찾아볼 수 있는 공간입니다.',
      link: '/board',
      icon: <DocumentTextIcon className="w-12 h-12" />,
      requiresAuth: false,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800">AI 안전관리 플랫폼</h1>
        <p className="mt-4 text-lg text-gray-600">
          AI를 활용하여 더 안전한 작업 환경을 만듭니다. 위험을 분석하고, 답변을 얻고, 협업하세요.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature) => (
          <FeatureCard
            key={feature.title}
            title={feature.title}
            description={feature.description}
            link={feature.link}
            icon={feature.icon}
            requiresAuth={feature.requiresAuth}
          />
        ))}
      </div>

      <section className="mt-16 py-12 bg-white rounded-xl shadow-lg">
        <div className="container mx-auto px-6 text-center">
            <h2 className="text-3xl font-semibold text-gray-800">왜 AI-RISKA를 선택해야 할까요?</h2>
            <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
                우리 플랫폼은 최첨단 AI와 실용적인 안전 관리 도구를 통합하여 사전에 위험을 식별하고, 규정 준수를 보장하며, 강력한 안전 문화를 조성하는 데 도움을 줍니다.
            </p>
            <div className="mt-10 grid md:grid-cols-3 gap-8">
                <div className="p-6">
                    <div className="text-primary-500 inline-block p-3 bg-primary-100 rounded-full mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"></path></svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700">신속한 분석</h3>
                    <p className="mt-2 text-gray-500">며칠이 아닌 몇 분 만에 AI 기반 통찰력을 얻으세요.</p>
                </div>
                <div className="p-6">
                    <div className="text-primary-500 inline-block p-3 bg-primary-100 rounded-full mb-3">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700">실행 가능한 통찰력</h3>
                    <p className="mt-2 text-gray-500">명확하고 실용적인 개선 권장 사항.</p>
                </div>
                <div className="p-6">
                    <div className="text-primary-500 inline-block p-3 bg-primary-100 rounded-full mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"></path></svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700">규정 준수 중심</h3>
                    <p className="mt-2 text-gray-500">관련 안전 규정에 대한 최신 정보를 확인하세요.</p>
                </div>
            </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
