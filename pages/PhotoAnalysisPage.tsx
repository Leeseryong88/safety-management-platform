import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import UploadDropZone from '../components/UploadDropZone';
import PhotoAnalysisResult from '../components/PhotoAnalysisResult';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import { analyzePhotoForHazards, fileToBase64 } from '../lib/gemini';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { PhotoAnalysis, PhotoAnalysisResultItem } from '../types';
import { useAuth } from '../components/Layout';
import { CameraIcon, ArrowDownTrayIcon, PlusCircleIcon, EyeIcon, InformationCircleIcon, TrashIcon } from '../components/Icons';

type PageMode = 'list' | 'create' | 'view' | 'guest_analysis';

const PhotoAnalysisPage: React.FC = () => {
  const { currentUser, loadingAuth } = useAuth();
  const location = useLocation(); 
  const navigate = useNavigate(); 

  const [file, setFile] = useState<File | null>(null);
  const [imageDescription, setImageDescription] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<PhotoAnalysisResultItem | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCurrentAnalysisSaved, setIsCurrentAnalysisSaved] = useState<boolean>(false);
  const [currentAnalysisImageUrl, setCurrentAnalysisImageUrl] = useState<string | null>(null);
  
  // 새로운 상태들
  const [pageMode, setPageMode] = useState<PageMode>('list');
  const [analysesList, setAnalysesList] = useState<PhotoAnalysis[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [currentViewingAnalysis, setCurrentViewingAnalysis] = useState<PhotoAnalysis | null>(null);

  // 삭제 관련 상태
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [analysisToDelete, setAnalysisToDelete] = useState<PhotoAnalysis | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (loadingAuth) return;

    // 로그인하지 않은 사용자의 경우
    if (!currentUser) {
      const state = location.state as { analysisToLoad?: PhotoAnalysis } | null;
      if (state?.analysisToLoad) {
        // 저장된 분석을 보려면 로그인 필요
        navigate('/login', { state: { from: location }, replace: true });
        return;
      }
      // 새 분석은 로그인 없이 가능
      setPageMode('guest_analysis');
      resetCreateMode();
      return;
    }
    
    // 사용자가 로그인된 상태
    setPageMode(prevMode => prevMode === 'guest_analysis' ? 'list' : prevMode);

    const state = location.state as { analysisToLoad?: PhotoAnalysis } | null; 
    if (state?.analysisToLoad) {
        setCurrentViewingAnalysis(state.analysisToLoad);
        setAnalysisResult(state.analysisToLoad.result);
        setImageDescription(state.analysisToLoad.description || '');
        setError(state.analysisToLoad.error || null);
        setIsCurrentAnalysisSaved(true); 
        if (state.analysisToLoad.photoUrl){
            setCurrentAnalysisImageUrl(state.analysisToLoad.photoUrl);
            setFile(null); 
        }
        setPageMode('view');
        window.scrollTo(0, 0);
        navigate(location.pathname, { replace: true, state: null });
    } else if (pageMode === 'list') {
      fetchAnalyses();
    } else if (pageMode === 'create') {
      resetCreateMode();
    }
  }, [currentUser, loadingAuth, location, navigate, pageMode]);

  const fetchAnalyses = useCallback(async () => {
    if (!currentUser) {
      setAnalysesList([]);
      setIsLoadingList(false);
      return;
    }
    setIsLoadingList(true);
    setError(null);
    try {
      const q = query(
        collection(db, "photoAnalyses"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const fetchedAnalyses: PhotoAnalysis[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedAnalyses.push({ id: docSnap.id, ...docSnap.data() } as PhotoAnalysis);
      });
      setAnalysesList(fetchedAnalyses);
    } catch (err: any) {
      console.error("Error fetching analyses:", err);
      if (err.code === 'unavailable') {
        setError("저장된 분석을 불러오지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError("분석 목록을 불러오는데 실패했습니다: " + err.message);
      }
    } finally {
      setIsLoadingList(false);
    }
  }, [currentUser]);

  const resetCreateMode = () => {
    setFile(null);
    setImageDescription('');
    setAnalysisResult(null);
    setError(null);
    setIsCurrentAnalysisSaved(false);
    setCurrentAnalysisImageUrl(null);
    setCurrentViewingAnalysis(null);
  };

  const handleCreateNew = () => {
    resetCreateMode();
    setPageMode('create');
  };

  const handleBackToList = () => {
    resetCreateMode();
    setPageMode('list');
    fetchAnalyses();
  };

  const handleViewAnalysis = (analysis: PhotoAnalysis) => {
    setCurrentViewingAnalysis(analysis);
    setAnalysisResult(analysis.result);
    setImageDescription(analysis.description || '');
    setError(analysis.error || null);
    setIsCurrentAnalysisSaved(true);
    setCurrentAnalysisImageUrl(analysis.photoUrl);
    setFile(null);
    setPageMode('view');
  };

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile);
    setAnalysisResult(null);
    setError(null);
    setIsCurrentAnalysisSaved(false);
    setCurrentAnalysisImageUrl(null);
    if (selectedFile) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setCurrentAnalysisImageUrl(reader.result as string | null);
        };
        reader.readAsDataURL(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("먼저 이미지를 업로드하세요.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setIsCurrentAnalysisSaved(false);

    try {
      const base64ImageData = await fileToBase64(file);
      const resultData = await analyzePhotoForHazards(base64ImageData, file.type, imageDescription);
      setAnalysisResult(resultData);
    } catch (err: any) {
      console.error("Analysis error:", err);
      let userFriendlyError = "분석 중 예상치 못한 오류가 발생했습니다.";
      if (err.message && err.message.includes("Failed to parse AI response")) {
        userFriendlyError = "AI 응답 형식이 올바르지 않아 분석에 실패했습니다. 다른 이미지를 사용하거나 잠시 후 다시 시도해 주세요.";
      } else if (err.code === 'unavailable') {
        userFriendlyError = "AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.";
      } else if (err.message) {
        userFriendlyError = err.message;
      }
      setError(userFriendlyError);
      setAnalysisResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveAnalysis = async () => {
    if (!file || !analysisResult || !currentUser) {
      setError("저장할 분석 결과가 없거나, 파일이 없거나, 로그인되어 있지 않습니다.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      console.log("Starting file upload...", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        userId: currentUser.uid
      });
      
      const timestamp = Date.now();
      const storageRef = ref(storage, `uploads/${timestamp}_${file.name}`);
      
      console.log("Storage ref created:", storageRef.toString());
      
      const snapshot = await uploadBytes(storageRef, file);
      console.log("Upload successful:", snapshot);
      
      const photoUrl = await getDownloadURL(snapshot.ref);
      console.log("Download URL obtained:", photoUrl);

      // Firestore는 undefined 값을 허용하지 않으므로 조건부로 필드 추가
      const analysisDoc: Omit<PhotoAnalysis, 'id'> = {
        userId: currentUser.uid,
        photoUrl: photoUrl,
        imageFileName: file.name,
        description: imageDescription || '',
        result: analysisResult,
        createdAt: serverTimestamp() as Timestamp,
      };
      
      // error가 존재할 때만 추가
      if (error) {
        (analysisDoc as any).error = error;
      }
      
      await addDoc(collection(db, "photoAnalyses"), analysisDoc);
      setIsCurrentAnalysisSaved(true);
      alert("분석 결과가 성공적으로 저장되었습니다!");
    } catch (err: any) {
      console.error("Error saving analysis:", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        name: err.name,
        stack: err.stack
      });
      
      if (err.code === 'unavailable') {
        setError("분석 결과를 저장하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else if (err.code === 'storage/unauthorized') {
        setError("Storage 접근 권한이 없습니다. Firebase 설정을 확인해주세요.");
      } else if (err.message && err.message.includes('CORS')) {
        setError("CORS 정책 오류입니다. Firebase Console에서 Storage 설정을 확인해주세요.");
      } else {
        setError(`업로드 오류: ${err.message || "분석 결과를 저장하는 중 오류가 발생했습니다."}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (analysis: PhotoAnalysis, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 방지
    setAnalysisToDelete(analysis);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!analysisToDelete || !analysisToDelete.id || !currentUser) return;

    setIsDeleting(true);
    setError(null);
    try {
      // Storage에서 이미지 삭제
      if (analysisToDelete.photoUrl) {
        const photoRef = ref(storage, analysisToDelete.photoUrl);
        await deleteObject(photoRef).catch(e => console.warn("Error deleting storage file:", e));
      }
      
      // Firestore에서 문서 삭제
      const docRef = doc(db, "photoAnalyses", analysisToDelete.id);
      await deleteDoc(docRef);
      
      // 로컬 상태 업데이트
      setAnalysesList(prevItems => prevItems.filter(item => item.id !== analysisToDelete.id));
      alert("분석이 성공적으로 삭제되었습니다.");
    } catch (err: any) {
      console.error("Error deleting analysis:", err);
      if (err.code === 'unavailable') {
        setError("분석을 삭제하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError("분석 삭제 중 오류 발생: " + err.message);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setAnalysisToDelete(null);
    }
  };

  const handleCardClick = (analysis: PhotoAnalysis) => {
    handleViewAnalysis(analysis);
  };

  if (loadingAuth) {
    return <div className="flex justify-center items-center h-full"><Spinner text="인증 정보 로딩 중..." /></div>;
  }

  // 게스트 분석 모드 (로그인하지 않은 사용자)
  if (pageMode === 'guest_analysis') {
    return (
      <div className="container mx-auto p-4 space-y-6">
        {/* 헤더 */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <CameraIcon className="w-8 h-8 text-primary-600 mr-3"/>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AI 사진 위험 분석</h1>
                <p className="text-gray-600 mt-1">로그인 없이도 AI 분석을 체험할 수 있습니다</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/login', { state: { from: location } })}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              로그인
            </button>
          </div>
          
          {/* 게스트 사용자 안내 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <InformationCircleIcon className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">🎯 체험 분석 모드</p>
                <p>• AI 사진 위험 분석을 무료로 체험할 수 있습니다</p>
                <p>• 분석 결과 저장, 기록 관리 등은 로그인 후 이용 가능합니다</p>
              </div>
            </div>
          </div>

          <p className="text-gray-600">
            작업 환경 이미지를 업로드하세요. AI가 잠재적 위험을 분석하고, 공학적 및 관리적 개선 사항을 제안하며, 관련 안전 규정을 안내합니다.
          </p>
        </div>

        {/* 분석 폼 */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <UploadDropZone onFileChange={handleFileChange} label="작업 현장 이미지 업로드" />
            <div>
              <label htmlFor="imageDescription" className="block text-sm font-medium text-gray-700 mb-1">
                선택 사항: 이미지 또는 상황을 간략하게 설명해주세요 (예: "밀폐 공간에서의 용접 작업")
              </label>
              <textarea
                id="imageDescription"
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2"
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                placeholder="예: '비계 위 고소 작업'"
              />
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !file}
            className="mt-6 w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isAnalyzing && <Spinner size="sm" color="text-white" />}
            <span className="ml-2">사진 분석</span>
          </button>
        </div>

        {isAnalyzing && <div className="flex justify-center mt-4"><Spinner text="이미지 분석 중, 잠시만 기다려주세요..." /></div>}
        
        {analysisResult && (
          <div className="bg-white p-6 rounded-lg shadow-md mt-6">
            <PhotoAnalysisResult result={analysisResult} error={error} />
            
            {/* 로그인 유도 메시지 */}
            <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <InformationCircleIcon className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">💾 분석 결과를 저장하시겠습니까?</h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    로그인하시면 분석 결과를 저장하고, 언제든 다시 확인할 수 있습니다.
                  </p>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => navigate('/login', { state: { from: location } })}
                      className="px-4 py-2 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700 transition-colors"
                    >
                      로그인하고 저장하기
                    </button>
                    <button
                      onClick={() => {
                        setAnalysisResult(null);
                        setFile(null);
                        setImageDescription('');
                        setError(null);
                        setCurrentAnalysisImageUrl(null);
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors"
                    >
                      새 분석 시작
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {error && !analysisResult && <p className="text-red-500 bg-red-100 p-3 rounded-md mt-4 text-center">{error}</p>}
      </div>
    );
  }

  // 목록 보기 모드
  if (pageMode === 'list') {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <header className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CameraIcon className="w-8 h-8 text-primary-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AI 사진 위험 분석</h1>
                <p className="text-gray-600 mt-1">저장된 사진 분석 결과를 확인하거나 새로운 분석을 시작하세요.</p>
              </div>
            </div>
            <button
              onClick={handleCreateNew}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <PlusCircleIcon className="w-5 h-5 mr-2" />
              새 분석
            </button>
          </div>
        </header>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">저장된 사진 분석</h2>
          {isLoadingList && <div className="flex justify-center py-8"><Spinner text="분석 목록 로딩 중..." /></div>}
          {error && <p className="text-red-500 bg-red-100 p-3 rounded-md text-center">{error}</p>}
          
          {!isLoadingList && !error && analysesList.length === 0 && (
            <div className="text-center py-10">
              <CameraIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500 mb-4">저장된 사진 분석이 없습니다.</p>
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                첫 번째 분석 시작하기
              </button>
            </div>
          )}

          {!isLoadingList && analysesList.length > 0 && (
            <div className="space-y-4">
              {analysesList.map(analysis => (
                <div 
                  key={analysis.id} 
                  className="bg-white p-4 sm:p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 border cursor-pointer"
                  onClick={() => handleCardClick(analysis)}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    {/* 썸네일 이미지 */}
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-100 border">
                        {analysis.photoUrl ? (
                          <img 
                            src={analysis.photoUrl} 
                            alt="분석 이미지"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling!.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className="w-full h-full flex items-center justify-center text-gray-400 hidden">
                          <CameraIcon className="w-8 h-8" />
                        </div>
                      </div>
                    </div>

                    {/* 분석 정보 */}
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center mb-2">
                        <CameraIcon className="w-5 h-5 text-blue-500 mr-2" />
                        <span className="text-xs font-semibold uppercase text-blue-600">사진 위험 분석</span>
                      </div>
                      <h2 className="text-lg font-semibold text-primary-700 break-words mb-1">
                        {analysis.imageFileName}
                      </h2>
                      <p className="text-xs text-gray-500 mb-2">
                        생성일: {analysis.createdAt?.toDate().toLocaleDateString()} {analysis.createdAt?.toDate().toLocaleTimeString()}
                      </p>
                      {analysis.description && (
                        <p className="text-sm text-gray-600 truncate">
                          설명: {analysis.description}
                        </p>
                      )}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex space-x-2 flex-shrink-0">
                      <button 
                        onClick={(e) => handleDeleteRequest(analysis, e)} 
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-all duration-200" 
                        title="삭제"
                        aria-label="삭제"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 생성 또는 보기 모드
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* 헤더 */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <CameraIcon className="w-8 h-8 text-primary-600 mr-3"/>
            <h1 className="text-2xl font-bold text-gray-800">
              {pageMode === 'create' ? 'AI 사진 위험 분석' : '사진 분석 결과'}
            </h1>
          </div>
          <button
            onClick={handleBackToList}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            목록으로
          </button>
        </div>
        {pageMode === 'create' && (
          <p className="text-gray-600 mb-6">
            작업 환경 이미지를 업로드하세요. AI가 잠재적 위험을 분석하고, 공학적 및 관리적 개선 사항을 제안하며, 관련 안전 규정을 안내합니다.
          </p>
        )}
      </div>

      {/* 분석 생성 폼 (생성 모드일 때만) */}
      {pageMode === 'create' && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <UploadDropZone onFileChange={handleFileChange} label="작업 현장 이미지 업로드" />
            <div>
              <label htmlFor="imageDescription" className="block text-sm font-medium text-gray-700 mb-1">
                선택 사항: 이미지 또는 상황을 간략하게 설명해주세요 (예: "밀폐 공간에서의 용접 작업")
              </label>
              <textarea
                id="imageDescription"
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2"
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                placeholder="예: '비계 위 고소 작업'"
              />
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !file}
            className="mt-6 w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isAnalyzing && <Spinner size="sm" color="text-white" />}
            <span className="ml-2">사진 분석</span>
          </button>
        </div>
      )}

      {/* 보기 모드일 때 이미지 표시 */}
      {pageMode === 'view' && currentAnalysisImageUrl && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">분석된 이미지</h3>
          <div className="flex justify-center">
            <img 
              src={currentAnalysisImageUrl} 
              alt="분석된 이미지" 
              className="max-w-full h-auto rounded-lg shadow-md"
              style={{ maxHeight: '400px' }}
            />
          </div>
          {imageDescription && (
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-700"><strong>설명:</strong> {imageDescription}</p>
            </div>
          )}
        </div>
      )}

      {isAnalyzing && <div className="flex justify-center mt-4"><Spinner text="이미지 분석 중, 잠시만 기다려주세요..." /></div>}
      
      {analysisResult && (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
            <PhotoAnalysisResult result={analysisResult} error={error} />
            {currentUser && !isCurrentAnalysisSaved && file && pageMode === 'create' && (
                 <button
                    onClick={handleSaveAnalysis}
                    disabled={isSaving}
                    className="mt-6 w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300"
                >
                    {isSaving ? <Spinner size="sm" color="text-white"/> : <ArrowDownTrayIcon className="w-5 h-5 mr-2"/>}
                    <span className="ml-1">분석 결과 저장</span>
                </button>
            )}
            {!currentUser && analysisResult && !isCurrentAnalysisSaved && (
                 <p className="mt-4 text-sm text-yellow-700 bg-yellow-100 p-3 rounded-md">
                    로그인하시면 이 분석 결과를 저장할 수 있습니다.
                </p>
            )}
            {isCurrentAnalysisSaved && (
                 <p className="mt-4 text-sm text-green-700 bg-green-100 p-3 rounded-md text-center">
                    이 분석 결과는 저장되었거나, 저장소에서 불러온 항목입니다.
                </p>
            )}
        </div>
      )}
      {error && !analysisResult && <p className="text-red-500 bg-red-100 p-3 rounded-md mt-4 text-center">{error}</p>}

      {/* 삭제 확인 모달 */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="삭제 확인"
        footer={
          <>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              disabled={isDeleting}
            >
              취소
            </button>
            <button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300"
            >
              {isDeleting ? <Spinner size="sm" /> : '삭제 확인'}
            </button>
          </>
        }
      >
        <p>이 분석을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다. 관련 파일도 함께 삭제됩니다.</p>
      </Modal>

    </div>
  );
};

export default PhotoAnalysisPage;