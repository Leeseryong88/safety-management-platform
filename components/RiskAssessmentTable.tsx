
import React from 'react';
import { RiskAssessment, HazardItem } from '../types';
import { ArrowDownTrayIcon } from './Icons';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Imports and extends jsPDF prototype
import * as XLSX from 'xlsx';

interface RiskAssessmentTableProps {
  assessment: RiskAssessment | null;
  error?: string | null;
}

const getRiskLevel = (severity: number, likelihood: number): { level: string, colorClass: string, score: number } => {
  const riskScore = severity * likelihood;
  if (riskScore >= 15) return { level: '매우 높음', colorClass: 'bg-red-700 text-white', score: riskScore };
  if (riskScore >= 10) return { level: '높음', colorClass: 'bg-red-500 text-white', score: riskScore };
  if (riskScore >= 5) return { level: '중간', colorClass: 'bg-yellow-400 text-black', score: riskScore };
  return { level: '낮음', colorClass: 'bg-green-500 text-white', score: riskScore };
};

// !!중요!!: 아래 placeholder를 실제 NanumGothic-Regular.ttf 파일의 Base64 인코딩된 문자열로 교체해야 합니다.
// 예시: const nanumGothicBase64 = "AAEAAAAPAIAAAwBwRkZUTLOKkMIAAA..."; (매우 긴 문자열)
// 변환 도구: 온라인 'ttf to base64 converter' 검색
const nanumGothicBase64 = "YOUR_ACTUAL_BASE64_ENCODED_NANUM_GOTHIC_REGULAR_TTF_FONT_DATA_HERE";

const RiskAssessmentTable: React.FC<RiskAssessmentTableProps> = ({ assessment, error }) => {
  if (error) {
    return (
      <div className="mt-6 p-4 border border-red-300 bg-red-50 rounded-md">
        <h3 className="text-lg font-medium text-red-700">평가 오류</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="mt-6 p-4 border border-gray-200 bg-gray-50 rounded-md text-center">
        <p className="text-gray-500">사용 가능한 위험성 평가 데이터가 없습니다. 위 양식을 사용하여 생성하십시오.</p>
      </div>
    );
  }

  const handleDownloadPDF = () => {
    if (!assessment) return;
    const doc = new jsPDF();
    const title = assessment.title || "위험성 평가";
    const createdDate = assessment.createdAt?.toDate().toLocaleDateString() || 'N/A';

    let fontName = 'helvetica'; // 기본 폰트
    if (nanumGothicBase64 !== "YOUR_ACTUAL_BASE64_ENCODED_NANUM_GOTHIC_REGULAR_TTF_FONT_DATA_HERE") {
      try {
        doc.addFileToVFS('NanumGothic-Regular.ttf', nanumGothicBase64);
        doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'normal');
        fontName = 'NanumGothic';
      } catch (e) {
        console.error("Error adding NanumGothic font:", e);
        alert("한글 폰트 로딩에 실패하여 PDF 글자가 깨질 수 있습니다. NanumGothic Base64 데이터를 확인해주세요.");
      }
    } else {
      console.warn("PDF Font Warning: NanumGothic font is not embedded. Korean text may not render correctly. Update nanumGothicBase64 in RiskAssessmentTable.tsx.");
      alert("한글 폰트가 임베드되지 않아 PDF 글자가 깨질 수 있습니다. 관리자에게 문의하거나 설정을 확인하세요.");
    }
    
    doc.setFont(fontName);

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.text(`공정/장비: ${assessment.processName || 'N/A'}`, 14, 30);
    doc.text(`생성일: ${createdDate}`, 14, 36);
    
    const tableColumn = ["위험 설명", "심각도", "가능성", "위험 점수", "위험 수준", "대응책"];
    const tableRows: (string | number)[][] = [];

    assessment.hazards.forEach(hazard => {
      const risk = getRiskLevel(hazard.severity, hazard.likelihood);
      const hazardData = [
        hazard.description,
        hazard.severity,
        hazard.likelihood,
        risk.score,
        risk.level,
        hazard.countermeasures
      ];
      tableRows.push(hazardData);
    });

    if (typeof (doc as any).autoTable === 'function') {
        (doc as any).autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 45,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, font: fontName },
            headStyles: { fillColor: [22, 160, 133], font: fontName, textColor: [255,255,255] }, 
            columnStyles: {
                 0: { cellWidth: 50 }, 
                 5: { cellWidth: 50 }, 
            }
        });
    } else {
        console.error("jsPDF.autoTable is not a function. Check jspdf-autotable import.");
        alert("PDF 생성 오류: autoTable 함수를 찾을 수 없습니다.");
        return;
    }
    
    let finalY = (doc as any).lastAutoTable.finalY || 70; 
    doc.setFont(fontName); // autoTable 후 폰트 재설정

    if (assessment.adminComment) {
      doc.setFontSize(12);
      doc.text("관리자/검토자 의견:", 14, finalY + 10);
      doc.setFontSize(10);
      const splitComment = doc.splitTextToSize(assessment.adminComment, 180);
      doc.text(splitComment, 14, finalY + 16);
    }

    doc.save(`${title.replace(/\s+/g, '_')}_위험성평가.pdf`);
  };

  const handleDownloadExcel = () => {
    if (!assessment) return;
    const title = assessment.title || "위험성 평가";
    const createdDate = assessment.createdAt?.toDate().toLocaleDateString() || 'N/A';

    const wsData: (string | number | Date | null)[][] = [
      ['위험성 평가 제목:', title],
      ['공정/장비:', assessment.processName || 'N/A'],
      ['생성일:', createdDate],
      [], 
      ['위험 설명', '심각도 (1-5)', '가능성 (1-5)', '위험 점수', '위험 수준', '대응책']
    ];

    assessment.hazards.forEach(h => {
      const risk = getRiskLevel(h.severity, h.likelihood);
      wsData.push([
        h.description,
        h.severity,
        h.likelihood,
        risk.score,
        risk.level,
        h.countermeasures
      ]);
    });

    if (assessment.adminComment) {
      wsData.push([]); 
      wsData.push(['관리자/검토자 의견:', assessment.adminComment]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const columnWidths = [
        { wch: 50 }, 
        { wch: 15 }, 
        { wch: 15 }, 
        { wch: 10 }, 
        { wch: 15 }, 
        { wch: 50 }  
    ];
    ws['!cols'] = columnWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '위험성평가');
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_위험성평가.xlsx`);
  };

  return (
    <div className="mt-8 bg-white p-6 rounded-lg shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{assessment.title}</h2>
          <p className="text-sm text-gray-600">공정/장비: {assessment.processName}</p>
          <p className="text-sm text-gray-500">생성일: {assessment.createdAt?.toDate().toLocaleDateString()}</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleDownloadPDF}
            className="flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="위험성 평가 PDF로 다운로드"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> PDF
          </button>
          <button
            onClick={handleDownloadExcel}
            className="flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="위험성 평가 Excel로 다운로드"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Excel
          </button>
        </div>
      </div>

      {assessment.photos && assessment.photos.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold text-gray-700 mb-2">관련 이미지:</h3>
          <div className="flex flex-wrap gap-2">
            {assessment.photos.map((photo, index) => (
              <a key={index} href={photo.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                <img src={photo.url} alt={photo.name || `평가 이미지 ${index + 1}`} className="h-20 w-20 object-cover rounded-md border" />
              </a>
            ))}
          </div>
        </div>
      )}
      
      {assessment.hazards.length === 0 ? (
        <p className="text-gray-600 italic my-4">AI 또는 사용자에 의해 이 평가에 대해 식별된 특정 위험 요소가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">위험 설명</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">심각도</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가능성</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">위험 수준</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">대응책</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {assessment.hazards.map((hazard: HazardItem, index: number) => {
                const risk = getRiskLevel(hazard.severity, hazard.likelihood);
                return (
                  <tr key={hazard.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap break-words min-w-[200px]">{hazard.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-center">{hazard.severity}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-center">{hazard.likelihood}</td>
                    <td className="px-4 py-3 text-sm text-center">
                        <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${risk.colorClass}`}>
                            {risk.level} ({risk.score})
                        </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap break-words min-w-[200px]">{hazard.countermeasures}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}


      {assessment.adminComment && (
        <div className="mt-6 pt-4 border-t">
          <h3 className="text-md font-semibold text-gray-700">관리자/검토자 의견:</h3>
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{assessment.adminComment}</p>
        </div>
      )}
    </div>
  );
};

export default RiskAssessmentTable;
    