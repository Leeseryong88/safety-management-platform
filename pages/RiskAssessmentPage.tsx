import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; 
import RiskAssessmentForm from '../components/RiskAssessmentForm';
import RiskAssessmentTable from '../components/RiskAssessmentTable';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import { generateRiskAssessment, fileToBase64, generateAdditionalHazards } from '../lib/gemini';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, doc, updateDoc, Timestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { RiskAssessment, HazardItem, GeminiRawHazardItem } from '../types';
import { useAuth } from '../components/Layout';
import { ClipboardListIcon, InformationCircleIcon, PencilIcon, PlusCircleIcon, Cog6ToothIcon, ArrowDownTrayIcon, TrashIcon } from '../components/Icons';
import { v4 as uuidv4 } from 'uuid';

type PageMode = 'list' | 'create' | 'edit' | 'view' | 'guest_analysis';

const RiskAssessmentPage: React.FC = () => {
  const { currentUser, loadingAuth } = useAuth();
  const location = useLocation(); 
  const navigate = useNavigate(); 

  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); 
  const [isSaving, setIsSaving] = useState<boolean>(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [pageMode, setPageMode] = useState<PageMode>('list');
  const [assessmentsList, setAssessmentsList] = useState<RiskAssessment[]>([]);
  const [currentEditingAssessment, setCurrentEditingAssessment] = useState<RiskAssessment | null>(null); 
  const [formInitialData, setFormInitialData] = useState<Partial<RiskAssessment> | undefined>(undefined);
  const [isPerformingAdditionalAnalysis, setIsPerformingAdditionalAnalysis] = useState<boolean>(false);
  const [isCurrentAssessmentSaved, setIsCurrentAssessmentSaved] = useState<boolean>(true); 
  const [stagedFilesForUpload, setStagedFilesForUpload] = useState<File[]>([]);

  // 삭제 관련 상태
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assessmentToDelete, setAssessmentToDelete] = useState<RiskAssessment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

   useEffect(() => {
    if (loadingAuth) return; 

    // 로그인하지 않은 사용자의 경우
    if (!currentUser) {
      const state = location.state as { assessmentToLoad?: RiskAssessment } | null;
      if (state?.assessmentToLoad) {
        // 저장된 평가를 보려면 로그인 필요
        navigate('/login', { state: { from: location }, replace: true });
        return;
      }
      // 새 평가는 로그인 없이 가능
      setPageMode('guest_analysis');
      setAssessment(null);
      setCurrentEditingAssessment(null);
      setFormInitialData({});
      setIsCurrentAssessmentSaved(false);
      return;
    }
    
    // User is logged in
    setPageMode(prevMode => prevMode === 'guest_analysis' ? 'list' : prevMode); // If it was guest_analysis, switch to list

    const state = location.state as { assessmentToLoad?: RiskAssessment } | null;
    if (state?.assessmentToLoad) {
        setAssessment(state.assessmentToLoad);
        setCurrentEditingAssessment(state.assessmentToLoad);
        setFormInitialData(state.assessmentToLoad);
        setPageMode('view');
        setIsCurrentAssessmentSaved(true); 
        window.scrollTo(0,0);
        navigate(location.pathname, { replace: true, state: null }); // Clear state after loading
    } else if (pageMode === 'list') {
      fetchAssessments();
    } else if (pageMode === 'create') { 
      setAssessment(null); 
      setCurrentEditingAssessment(null);
      setFormInitialData({});
      setIsCurrentAssessmentSaved(false);
    }
  }, [currentUser, loadingAuth, location, navigate, pageMode]);


  const fetchAssessments = useCallback(async () => {
    if (!currentUser) {
        setAssessmentsList([]);
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    try {
      const q = query(
        collection(db, "riskAssessments"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const fetchedAssessments: RiskAssessment[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedAssessments.push({ id: docSnap.id, ...docSnap.data() } as RiskAssessment);
      });
      setAssessmentsList(fetchedAssessments);
    } catch (err: any) {
      console.error("Error fetching assessments:", err);
      if (err.code === 'unavailable') {
        setError("평가 목록을 불러오지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError("평가를 불러오는데 실패했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);


  const handleFormSubmit = async (
    formData: Omit<RiskAssessment, 'id' | 'userId' | 'createdAt' | 'photos'> & { hazards?: HazardItem[] },
    filesToStage: File[] 
  ) => {
    // 게스트 모드에서도 분석 가능하도록 수정
    setIsLoading(true);
    setError(null);
    setStagedFilesForUpload(filesToStage); 

    try {
      let finalHazards: HazardItem[] = [];
      let finalAdminComment: string = '';
      let photoInfos: { url: string, name: string }[] = currentEditingAssessment?.photos || [];

      const newPhotoInfosFromStagedFiles = filesToStage.map(file => ({
          url: URL.createObjectURL(file), 
          name: file.name,
      }));

      if (pageMode === 'create' || pageMode === 'guest_analysis') {
        if (filesToStage.length === 0) {
          setError("AI 평가를 위해 하나 이상의 이미지를 업로드해주세요.");
          setIsLoading(false);
          return;
        }
        photoInfos = newPhotoInfosFromStagedFiles;
        
        const primaryFileForAI = filesToStage[0];
        const base64ImageData = await fileToBase64(primaryFileForAI);
        const aiGeneratedRawHazards = await generateRiskAssessment(base64ImageData, primaryFileForAI.type, formData.processName);
        finalHazards = aiGeneratedRawHazards.map((h: GeminiRawHazardItem) => ({
          id: uuidv4(),
          description: h.description || 'N/A',
          severity: typeof h.severity === 'number' ? h.severity : 3,
          likelihood: typeof h.likelihood === 'number' ? h.likelihood : 3,
          countermeasures: h.countermeasures || 'N/A',
        }));
        finalAdminComment = ''; 
      } else if (pageMode === 'edit' && currentEditingAssessment) {
        photoInfos = [...(currentEditingAssessment.photos || []), ...newPhotoInfosFromStagedFiles];
        finalHazards = formData.hazards || currentEditingAssessment.hazards || [];
        finalAdminComment = formData.adminComment || currentEditingAssessment.adminComment || '';
      }

      const tempAssessmentId = (pageMode === 'edit' && currentEditingAssessment?.id) || uuidv4();

      const completeAssessmentData: RiskAssessment = {
        id: tempAssessmentId, 
        userId: currentUser?.uid || 'guest',
        title: formData.title,
        processName: formData.processName,
        photos: photoInfos, 
        hazards: finalHazards,
        adminComment: finalAdminComment,
        createdAt: (pageMode === 'edit' && currentEditingAssessment?.createdAt) || Timestamp.now(), 
      };
      
      setAssessment(completeAssessmentData); 
      setCurrentEditingAssessment(completeAssessmentData); 
      setIsCurrentAssessmentSaved(false); 
      setPageMode('view');
      
      if (pageMode === 'create' || pageMode === 'guest_analysis') {
        alert("AI 위험성 평가 초안이 생성되었습니다. " + (currentUser ? "검토 후 '평가 저장'을 눌러주세요." : "로그인하시면 평가를 저장할 수 있습니다."));
      } else if (pageMode === 'edit') {
        alert("평가가 수정되었습니다. 검토 후 '업데이트 저장'을 눌러주세요.");
      }

    } catch (err: any) {
      console.error("Assessment generation error:", err);
      let userFriendlyError = "평가 처리 중 예상치 못한 오류가 발생했습니다.";
      if (err.message && err.message.includes("Failed to parse AI response")) {
        userFriendlyError = "AI 응답 형식이 올바르지 않아 분석에 실패했습니다. 다른 이미지를 사용하거나 잠시 후 다시 시도해 주세요.";
      } else if (err.code === 'unavailable') {
        userFriendlyError = "AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.";
      } else if (err.message) {
        userFriendlyError = err.message;
      }
      setError(userFriendlyError);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveOrUpdateAssessment = async () => {
    if (!assessment || !currentUser) {
        setError("저장할 평가 데이터가 없거나 로그인되어 있지 않습니다.");
        if(!currentUser) navigate('/login', { state: { from: location }, replace: true });
        return;
    }

    setIsSaving(true);
    setError(null);

    try {
        let finalPhotoInfos: { url: string, name: string }[] = [];
        const assessmentPhotos = assessment.photos || [];
        const alreadyUploadedPhotos = assessmentPhotos.filter(p => !p.url.startsWith('blob:'));
        finalPhotoInfos.push(...alreadyUploadedPhotos);

        for (const file of stagedFilesForUpload) {
            const storageRefPath = `riskAssessments/${currentUser.uid}/${Date.now()}_${file.name}`;
            const storageRefInstance = ref(storage, storageRefPath); // Corrected variable name
            const snapshot = await uploadBytes(storageRefInstance, file);
            const uploadedUrl = await getDownloadURL(snapshot.ref);
            finalPhotoInfos.push({ url: uploadedUrl, name: file.name });
        }
        setStagedFilesForUpload([]);

        const assessmentToSave: Omit<RiskAssessment, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: Timestamp, updatedAt?: Timestamp, id?: string } = {
            userId: currentUser.uid,
            title: assessment.title,
            processName: assessment.processName,
            photos: finalPhotoInfos,
            hazards: assessment.hazards,
            adminComment: assessment.adminComment,
        };
        
        let finalAssessmentId = assessment.id;

        if (assessment.id && assessmentsList.some(a => a.id === assessment.id)) { 
            const docRef = doc(db, "riskAssessments", assessment.id);
            assessmentToSave.updatedAt = serverTimestamp() as Timestamp;
            await updateDoc(docRef, { ...assessmentToSave }); // Spread to avoid id in update data
            alert("평가가 성공적으로 업데이트되었습니다!");
        } else { 
            assessmentToSave.createdAt = assessment.createdAt instanceof Timestamp ? assessment.createdAt : serverTimestamp() as Timestamp;
            const newDocRef = await addDoc(collection(db, "riskAssessments"), assessmentToSave);
            finalAssessmentId = newDocRef.id; 
            alert("평가가 성공적으로 저장되었습니다!");
        }
        
        const savedAssessment = { ...assessment, id: finalAssessmentId, photos: finalPhotoInfos, userId: currentUser.uid };
        setAssessment(savedAssessment);
        setCurrentEditingAssessment(savedAssessment);
        setIsCurrentAssessmentSaved(true);
        fetchAssessments(); 

    } catch (err:any) {
        console.error("Error saving/updating assessment:", err);
        if (err.code === 'unavailable') {
          setError("평가를 저장/업데이트하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
        } else {
          setError(err.message || "평가 저장 중 오류 발생");
        }
    } finally {
        setIsSaving(false);
    }
  };


  const handleAdditionalAiAnalysis = async () => {
    if (!assessment || !currentUser) {
        setError("추가 분석을 수행할 현재 평가가 없거나 로그인되어 있지 않습니다.");
        if(!currentUser) navigate('/login', { state: { from: location }, replace: true });
        return;
    }

    setIsPerformingAdditionalAnalysis(true);
    setError(null);

    try {
        const existingHazardDescriptions = assessment.hazards.map(h => h.description);
        const newRawHazards = await generateAdditionalHazards(assessment.processName, existingHazardDescriptions);

        if (newRawHazards.length === 0) {
            alert("AI가 추가적인 고유 위험 요인을 찾지 못했습니다.");
            setIsPerformingAdditionalAnalysis(false);
            return;
        }

        const newHazards: HazardItem[] = newRawHazards.map(h => ({
            id: uuidv4(),
            description: h.description || 'N/A',
            severity: typeof h.severity === 'number' ? h.severity : 3,
            likelihood: typeof h.likelihood === 'number' ? h.likelihood : 3,
            countermeasures: h.countermeasures || 'N/A',
        }));

        const distinctNewHazards = newHazards.filter(nh => 
            !existingHazardDescriptions.some(ehDesc => ehDesc.toLowerCase().includes(nh.description.toLowerCase()) || nh.description.toLowerCase().includes(ehDesc.toLowerCase()))
        );

        if (distinctNewHazards.length === 0) {
            alert("AI가 기존 위험 요인과 명확히 다른 새로운 위험 요인을 찾지 못했습니다.");
            setIsPerformingAdditionalAnalysis(false);
            return;
        }

        const updatedHazards = [...assessment.hazards, ...distinctNewHazards];
        const updatedAssessmentData = { 
            ...assessment, 
            hazards: updatedHazards,
        };

        setAssessment(updatedAssessmentData);
        setCurrentEditingAssessment(updatedAssessmentData);
        setIsCurrentAssessmentSaved(false); 
        alert("추가 AI 분석이 완료되었습니다. 변경사항을 저장하려면 '업데이트 저장' 버튼을 클릭하세요.");

    } catch (err: any) {
        console.error("Additional AI analysis error:", err);
        if (err.code === 'unavailable') {
          setError("AI 추가 분석에 실패했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
        } else {
          setError(err.message || "추가 AI 분석 중 오류가 발생했습니다.");
        }
    } finally {
        setIsPerformingAdditionalAnalysis(false);
    }
};


  const handleCreateNew = () => {
    if (!currentUser) {
      navigate('/login', { state: { from: location }, replace: true });
      return;
    }
    setCurrentEditingAssessment(null);
    setFormInitialData({}); 
    setAssessment(null);    
    setError(null);
    setPageMode('create');
    setIsCurrentAssessmentSaved(false);
    setStagedFilesForUpload([]);
  };
  
  const handleStartEditCurrentAssessment = () => {
    if (!assessment || !currentUser) {
       if(!currentUser) navigate('/login', { state: { from: location }, replace: true });
       return;
    }
    setCurrentEditingAssessment(assessment);
    setFormInitialData(assessment); 
    setError(null);
    setPageMode('edit');
    setIsCurrentAssessmentSaved(false); 
    setStagedFilesForUpload([]); 
  };

  const handleViewDetails = (ra: RiskAssessment) => {
     if (!currentUser) {
      navigate('/login', { state: { from: location }, replace: true });
      return;
    }
    setAssessment(ra);
    setCurrentEditingAssessment(ra); 
    setError(null);
    setPageMode('view');
    setIsCurrentAssessmentSaved(true); 
    setStagedFilesForUpload([]);
  }

  const handleDeleteRequest = (ra: RiskAssessment, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 방지
    setAssessmentToDelete(ra);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!assessmentToDelete || !assessmentToDelete.id || !currentUser) return;

    setIsDeleting(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      
      // Storage에서 관련 이미지들 삭제
      if (assessmentToDelete.photos && assessmentToDelete.photos.length > 0) {
        for (const photo of assessmentToDelete.photos) {
          if (photo.url && photo.url.includes("firebasestorage.googleapis.com")) {
            const photoRef = ref(storage, photo.url);
            await deleteObject(photoRef).catch(e => console.warn(`Error deleting storage file ${photo.name}:`, e));
          }
        }
      }
      
      // Firestore에서 문서 삭제
      const docRef = doc(db, "riskAssessments", assessmentToDelete.id);
      batch.delete(docRef);
      
      await batch.commit();
      
      // 로컬 상태 업데이트
      setAssessmentsList(prevItems => prevItems.filter(item => item.id !== assessmentToDelete.id));
      alert("평가가 성공적으로 삭제되었습니다.");
    } catch (err: any) {
      console.error("Error deleting assessment:", err);
      if (err.code === 'unavailable') {
        setError("평가를 삭제하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError("평가 삭제 중 오류 발생: " + err.message);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setAssessmentToDelete(null);
    }
  };

  const handleCardClick = (ra: RiskAssessment) => {
    handleViewDetails(ra);
  };

  if (loadingAuth) { 
    return <div className="flex justify-center items-center h-full"><Spinner text="로딩 중..." /></div>;
  }
  
  if (pageMode === 'guest_analysis') {
    return (
      <div className="container mx-auto p-4 space-y-6">
        {/* 헤더 */}
        <header className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <ClipboardListIcon className="w-8 h-8 text-primary-600 mr-3"/>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AI 위험성 평가</h1>
                <p className="text-gray-600 mt-1">로그인 없이도 AI 평가를 체험할 수 있습니다</p>
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
                <p className="font-medium mb-1">🎯 체험 평가 모드</p>
                <p>• AI 위험성 평가를 무료로 체험할 수 있습니다</p>
                <p>• 평가 결과 저장, 기록 관리 등은 로그인 후 이용 가능합니다</p>
              </div>
            </div>
          </div>
        </header>

        {/* 평가 폼 */}
        <RiskAssessmentForm 
          onSubmit={handleFormSubmit} 
          initialData={formInitialData}
          isLoading={isLoading} 
          mode={'create'} 
        />
        
        {isLoading && (
          <div className="flex justify-center mt-4">
            <Spinner text="AI로 초기 평가 생성 중..." />
          </div>
        )}

        {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mt-4 text-center">{error}</p>}

        {assessment && (
          <>
            <RiskAssessmentTable assessment={assessment} error={null} />
            
            {/* 로그인 유도 메시지 */}
            <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <InformationCircleIcon className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">💾 평가 결과를 저장하시겠습니까?</h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    로그인하시면 위험성 평가 결과를 저장하고, 언제든 다시 확인할 수 있습니다.
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
                        setAssessment(null);
                        setCurrentEditingAssessment(null);
                        setFormInitialData({});
                        setError(null);
                        setStagedFilesForUpload([]);
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors"
                    >
                      새 평가 시작
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center mb-4 sm:mb-0">
            <ClipboardListIcon className="w-8 h-8 text-primary-600 mr-3"/>
            <h1 className="text-2xl font-bold text-gray-800">AI 위험성 평가</h1>
        </div>
        { currentUser && (pageMode === 'view' || pageMode === 'edit') && (
             <button
                onClick={(e) => {
                    e.stopPropagation();
                    setPageMode('list'); 
                    setAssessment(null); 
                    setError(null);
                    setCurrentEditingAssessment(null);
                    setFormInitialData({});
                    setIsCurrentAssessmentSaved(true); 
                    setStagedFilesForUpload([]);
                }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
            목록으로 돌아가기
            </button>
        )}
        { currentUser && pageMode === 'list' && ( 
            <button
                onClick={handleCreateNew}
                className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
                <PlusCircleIcon className="w-5 h-5 mr-2" />
                새 평가 만들기
            </button>
        )}
      </header>
      
      {pageMode === 'list' && currentUser && (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">나의 위험성 평가</h2>
            {isLoading && assessmentsList.length === 0 && <Spinner text="평가 로딩 중..." />}
            {!isLoading && assessmentsList.length === 0 && (
              <div className="text-center py-10">
                <ClipboardListIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500 mb-4">위험성 평가를 찾을 수 없습니다.</p>
                <button
                  onClick={handleCreateNew}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  첫 번째 평가 시작하기
                </button>
              </div>
            )}
            {assessmentsList.length > 0 && (
                <div className="space-y-4">
                    {assessmentsList.map(ra => (
                        <div 
                          key={ra.id} 
                          className="bg-white p-4 sm:p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 border cursor-pointer"
                          onClick={() => handleCardClick(ra)}
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                {/* 썸네일 이미지 */}
                                <div className="flex-shrink-0">
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-100 border flex items-center justify-center relative">
                                        {ra.photos && ra.photos.length > 0 ? (
                                            <>
                                                <img 
                                                    src={ra.photos[0].url} 
                                                    alt="평가 이미지"
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                        target.nextElementSibling!.classList.remove('hidden');
                                                    }}
                                                />
                                                <div className="w-full h-full flex items-center justify-center text-gray-400 hidden">
                                                    <ClipboardListIcon className="w-8 h-8" />
                                                </div>
                                                {/* 다중 이미지 표시 */}
                                                {ra.photos.length > 1 && (
                                                    <div className="absolute bottom-0 right-0 bg-black bg-opacity-60 text-white text-xs px-1 rounded-tl">
                                                        +{ra.photos.length - 1}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <ClipboardListIcon className="w-8 h-8 text-gray-400" />
                                        )}
                                    </div>
                                </div>

                                {/* 평가 정보 */}
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center mb-2">
                                        <ClipboardListIcon className="w-5 h-5 text-green-500 mr-2" />
                                        <span className="text-xs font-semibold uppercase text-green-600">위험성 평가</span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-primary-700 break-words mb-1">
                                        {ra.title}
                                    </h3>
                                    <p className="text-xs text-gray-500 mb-2">
                                        생성일: {ra.createdAt?.toDate().toLocaleDateString()} {ra.createdAt?.toDate().toLocaleTimeString()}
                                    </p>
                                    <div className="space-y-1">
                                        <p className="text-sm text-gray-600 truncate">
                                            공정/장비: {ra.processName}
                                        </p>
                                        {ra.hazards && ra.hazards.length > 0 && (
                                            <p className="text-xs text-gray-500">
                                                위험요소 {ra.hazards.length}개
                                            </p>
                                        )}
                                        {ra.photos && ra.photos.length > 0 && (
                                            <p className="text-xs text-gray-500">
                                                첨부 이미지 {ra.photos.length}개
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* 액션 버튼 */}
                                <div className="flex space-x-2 flex-shrink-0">
                                    <button 
                                        onClick={(e) => handleDeleteRequest(ra, e)} 
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
      )}

      {(pageMode === 'create' || pageMode === 'edit') && currentUser && (
        <RiskAssessmentForm 
            onSubmit={handleFormSubmit} 
            initialData={formInitialData}
            isLoading={isLoading} 
            mode={pageMode as 'create' | 'edit'} 
        />
      )}
      
      {isLoading && (pageMode === 'create' || pageMode === 'edit') && (
        <div className="flex justify-center mt-4">
            <Spinner text={pageMode === 'edit' ? "평가 양식 로딩 중..." : "AI로 초기 평가 생성 중..."} />
        </div>
      )}

      {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mt-4 text-center">{error}</p>}

      {pageMode === 'view' && assessment && (
        <>
         <RiskAssessmentTable assessment={assessment} error={null} />
         {currentUser && (
           <div className="mt-6 flex flex-wrap gap-4 items-center">
              {!isCurrentAssessmentSaved && (
                  <button
                      onClick={handleSaveOrUpdateAssessment}
                      disabled={isSaving || isPerformingAdditionalAnalysis}
                      className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300"
                  >
                      {isSaving ? <Spinner size="sm" color="text-white" /> : <ArrowDownTrayIcon className="w-4 h-4 mr-2" />}
                      {assessment.id && assessmentsList.some(a => a.id === assessment.id) ? '업데이트 저장' : '평가 저장'}
                  </button>
              )}
               {isCurrentAssessmentSaved && (
                  <p className="text-sm text-green-700 bg-green-100 p-3 rounded-md">
                      이 평가는 현재 저장된 상태입니다.
                  </p>
              )}

              <button 
                  onClick={handleStartEditCurrentAssessment} 
                  className="flex items-center px-4 py-2 border border-yellow-600 text-sm font-medium rounded-md text-yellow-700 bg-yellow-50 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                  disabled={isPerformingAdditionalAnalysis || isSaving || isLoading}
              >
                  <PencilIcon className="w-4 h-4 mr-2"/> 이 평가 수정하기
              </button>
              <button
                  onClick={handleAdditionalAiAnalysis}
                  disabled={isPerformingAdditionalAnalysis || isSaving || isLoading || !assessment.photos || assessment.photos.length === 0}
                  className="flex items-center px-4 py-2 border border-blue-600 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  title={(!assessment.photos || assessment.photos.length === 0) ? "추가 분석을 위해서는 원본 평가에 이미지가 있어야 합니다." : "AI로 추가 위험 요인 분석"}
              >
                  {isPerformingAdditionalAnalysis ? <Spinner size="sm" /> : <Cog6ToothIcon className="w-4 h-4 mr-2" />}
                  AI로 추가 위험 요인 분석
              </button>
           </div>
         )}
         {isPerformingAdditionalAnalysis && <p className="text-blue-600 mt-2">AI가 추가 위험 요인을 분석 중입니다...</p>}
         {isSaving && <p className="text-green-600 mt-2">평가를 저장하는 중입니다...</p>}
        </>
      )}
       {pageMode === 'view' && !assessment && error && (
            <div className="mt-6 p-4 border border-red-300 bg-red-50 rounded-md text-center">
                <h3 className="text-lg font-medium text-red-700">오류</h3>
                <p className="text-red-600">{error}</p>
            </div>
        )}

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
         <p>이 평가를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다. 관련 파일도 함께 삭제됩니다.</p>
       </Modal>
    </div>
  );
};

export default RiskAssessmentPage;
