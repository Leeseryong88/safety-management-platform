
import React from 'react';
import { PhotoAnalysisResultItem } from '../types';
import { InformationCircleIcon } from './Icons';

interface PhotoAnalysisResultProps {
  result: PhotoAnalysisResultItem | null;
  error?: string | null;
}

const ResultSection: React.FC<{ title: string; items: string[] | undefined; icon?: React.ReactNode }> = ({ title, items, icon }) => {
  if (!items || items.length === 0) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-700 flex items-center">
          {icon && <span className="mr-2">{icon}</span>}
          {title}
        </h3>
        <p className="text-gray-500 italic mt-1">이 범주에 대해 식별된 특정 {title.toLowerCase()} 항목이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-xl font-semibold text-gray-800 mb-3 flex items-center">
        {icon && <span className="mr-2">{icon}</span>}
        {title}
      </h3>
      <ul className="list-disc list-inside space-y-2 text-gray-700">
        {items.map((item, index) => (
          <li key={index} className="leading-relaxed">{item}</li>
        ))}
      </ul>
    </div>
  );
};


const PhotoAnalysisResult: React.FC<PhotoAnalysisResultProps> = ({ result, error }) => {
  if (error) {
    return (
      <div className="mt-6 p-4 border border-red-300 bg-red-50 rounded-md">
        <h3 className="text-lg font-medium text-red-700">분석 오류</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
       <div className="mt-6 p-6 border border-yellow-400 bg-yellow-50 rounded-lg text-center">
        <InformationCircleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
        <p className="text-yellow-700 font-medium">아직 분석 결과가 없습니다.</p>
        <p className="text-sm text-yellow-600">이미지를 업로드하고 "사진 분석"을 클릭하여 결과를 확인하세요.</p>
      </div>
    );
  }
  
  const allEmpty = 
    (!result.hazards || result.hazards.length === 0) &&
    (!result.engineeringSolutions || result.engineeringSolutions.length === 0) &&
    (!result.managementSolutions || result.managementSolutions.length === 0) &&
    (!result.relatedRegulations || result.relatedRegulations.length === 0);

  if (allEmpty) {
    return (
      <div className="mt-6 p-6 border border-green-300 bg-green-50 rounded-lg text-center">
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-12 h-12 text-green-500 mx-auto mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-xl font-semibold text-green-700">특별한 위험 요인이 식별되지 않았습니다</h3>
        <p className="text-green-600 mt-2">AI 분석 결과, 제공된 이미지에서 특별한 위험 요인이나 개선 조치가 식별되지 않았습니다. 항상 주의를 기울이고 표준 안전 절차를 따르십시오.</p>
      </div>
    );
  }


  return (
    <div className="mt-8 space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">AI 분석 결과</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ResultSection title="식별된 위험 요인" items={result.hazards} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-red-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>} />
        <ResultSection title="공학적 해결책" items={result.engineeringSolutions} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-blue-500"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.527-1.032.257-2.335-.55-3.142V6.25a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6.25V11.25a2.25 2.25 0 002.25 2.25h1.687" /></svg>} />
        <ResultSection title="관리적 해결책" items={result.managementSolutions} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>} />
        <ResultSection title="관련 규정" items={result.relatedRegulations} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-indigo-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>} />
      </div>
    </div>
  );
};

export default PhotoAnalysisResult;