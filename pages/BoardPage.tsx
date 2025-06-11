import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { BoardPost, BoardCategory } from '../types';
import { useAuth } from '../components/Layout';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import { DocumentTextIcon, InformationCircleIcon, PencilIcon, PlusCircleIcon, TrashIcon, UserCircleIcon, AcademicCapIcon, BriefcaseIcon, EyeIcon, ChatBubbleLeftRightIcon } from '../components/Icons';
import Quill from 'quill';
import DOMPurify from 'dompurify';

const boardCategories: { key: BoardCategory; label: string; icon: React.FC<{className?: string}> }[] = [
  { key: 'safetyInfo', label: '안전보건 정보공유', icon: AcademicCapIcon },
  { key: 'jobPostings', label: '구인구직', icon: BriefcaseIcon },
];

const BoardPage: React.FC = () => {
  const { currentUser, loadingAuth } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<BoardCategory>('safetyInfo');
  
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 댓글 개수 캐시
  const [commentCounts, setCommentCounts] = useState<{[postId: string]: number}>({});

  const [showForm, setShowForm] = useState<boolean>(false);
  const [currentPostForForm, setCurrentPostForForm] = useState<Partial<BoardPost>>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 비로그인 사용자 글쓰기 시도 알림
  const [showLoginPrompt, setShowLoginPrompt] = useState<boolean>(false);

  const quillEditorRef = useRef<HTMLDivElement>(null);
  const quillInstanceRef = useRef<Quill | null>(null);

  const getCurrentPageInfo = () => {
    const categoryInfo = boardCategories.find(cat => cat.key === activeTab);
    return {
        title: categoryInfo?.label || '게시판',
        icon: categoryInfo?.icon || DocumentTextIcon,
    };
  };
  
  const { title: currentPageTitle, icon: CurrentPageIcon } = getCurrentPageInfo();

  // 내용 미리보기 함수 추가
  const getContentPreview = (htmlContent: string, maxLength: number = 100): string => {
    if (!htmlContent) return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = DOMPurify.sanitize(htmlContent);
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    return textContent.length > maxLength 
      ? textContent.substring(0, maxLength) + '...' 
      : textContent;
  };

  // 게시물 상세 보기 함수
  const handleViewPost = (post: BoardPost) => {
    navigate(`/post/${post.id}`);
  };

  // 모든 게시물의 댓글 개수 가져오기
  const fetchAllCommentCounts = async (postIds: string[]) => {
    const counts: {[postId: string]: number} = {};
    
    await Promise.all(postIds.map(async (postId) => {
      try {
        const q = query(
          collection(db, "boardComments"), 
          where("postId", "==", postId)
        );
        const querySnapshot = await getDocs(q);
        counts[postId] = querySnapshot.size;
      } catch (err) {
        console.error(`Error fetching comment count for post ${postId}:`, err);
        counts[postId] = 0;
      }
    }));
    
    setCommentCounts(counts);
  };

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, "boardPosts"), 
        where("category", "==", activeTab), 
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const fetchedPosts: BoardPost[] = [];
      querySnapshot.forEach((doc) => {
        fetchedPosts.push({ id: doc.id, ...doc.data() } as BoardPost);
      });
      setPosts(fetchedPosts);
      
      // 댓글 개수 가져오기
      const postIds = fetchedPosts.map(post => post.id).filter(Boolean) as string[];
      if (postIds.length > 0) {
        await fetchAllCommentCounts(postIds);
      }
    } catch (err: any) {
      console.error("Error fetching posts:", err);
      if (err.code === 'unavailable') {
        setError("게시물을 불러오지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError(`'${currentPageTitle}' 게시물을 불러오는데 실패했습니다.`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, currentPageTitle]);

  // 비로그인 사용자 글쓰기 시도 처리
  const handleCreatePostClick = () => {
    if (!currentUser) {
      setShowLoginPrompt(true);
      return;
    }
    
    if (showForm) {
      resetFormStates();
    } else {
      setCurrentPostForForm({ category: activeTab }); 
      setIsEditing(false);
      setShowForm(true);
    }
  };

  useEffect(() => {
    fetchPosts();
    resetFormStates(); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchPosts]);

  // Quill 인스턴스 정리 함수
  const cleanupQuillInstance = useCallback(() => {
    if (quillInstanceRef.current) {
      // Quill 인스턴스 정리
      try {
        quillInstanceRef.current.root.innerHTML = '';
      } catch (error) {
        console.warn('Error cleaning Quill content:', error);
      }
      quillInstanceRef.current = null;
    }
  }, []);

  // Quill 에디터 초기화
  useEffect(() => {
    // 폼이 숨겨질 때 Quill 인스턴스 정리
    if (!showForm) {
      cleanupQuillInstance();
      return;
    }

    // 사용자가 로그인하지 않았으면 폼 숨기기
    if (!currentUser) {
      setShowForm(false);
      alert("게시물 작성 및 수정은 로그인이 필요합니다.");
      return;
    }

    // DOM 요소가 준비될 때까지 약간의 지연
    const initializeQuill = () => {
      if (!quillEditorRef.current) {
        console.warn("Quill editor ref not ready, retrying...");
        setTimeout(initializeQuill, 100);
        return;
      }

      // 기존 인스턴스가 있다면 정리
      cleanupQuillInstance();
      
      try {
        const quill = new Quill(quillEditorRef.current, {
          theme: 'snow',
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['link', 'image', 'video'], 
              ['clean']
            ],
          },
          placeholder: '내용을 입력하세요...',
        });

        // 이미지 업로드 핸들러
        const toolbar = quill.getModule('toolbar') as any; 
        if (toolbar) {
          toolbar.addHandler('image', () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();

            input.onchange = async () => {
              const file = input.files?.[0];
              if (file && quillInstanceRef.current && currentUser) { 
                setIsSubmitting(true);
                setError(null);
                try {
                  const storageRefPath = `boardImages/${currentUser.uid}/${Date.now()}_${file.name}`;
                  const imageRef = ref(storage, storageRefPath);
                  await uploadBytes(imageRef, file);
                  const downloadURL = await getDownloadURL(imageRef);
                  
                  const range = quillInstanceRef.current.getSelection(true);
                  quillInstanceRef.current.insertEmbed(range.index, 'image', downloadURL);
                  quillInstanceRef.current.setSelection(range.index + 1, 0);
                } catch (uploadError: any) {
                  console.error("Error uploading image to board:", uploadError);
                  setError("이미지 업로드에 실패했습니다: " + uploadError.message);
                } finally {
                  setIsSubmitting(false);
                }
              }
            };
          });
        }

        quillInstanceRef.current = quill;

        // 편집 모드일 때 기존 내용 설정
        if (isEditing && currentPostForForm.content) {
          quill.root.innerHTML = currentPostForForm.content;
        } else {
          quill.root.innerHTML = ''; 
        }

        console.log("Quill editor initialized successfully");
      } catch (error) {
        console.error("Failed to initialize Quill editor:", error);
        setError("에디터 초기화에 실패했습니다. 페이지를 새로고침해주세요.");
      }
    };

    // 다음 틱에서 초기화 (DOM 업데이트 완료 후)
    setTimeout(initializeQuill, 0);

    // 컴포넌트 언마운트 시 정리
    return cleanupQuillInstance;
  }, [showForm, currentUser, cleanupQuillInstance]);

  // 편집 모드 변경 시 내용 업데이트 (별도 useEffect로 분리)
  useEffect(() => {
    if (quillInstanceRef.current && showForm) {
      if (isEditing && currentPostForForm.content) {
        quillInstanceRef.current.root.innerHTML = currentPostForForm.content;
      } else if (!isEditing) {
        quillInstanceRef.current.root.innerHTML = '';
      }
    }
  }, [isEditing, currentPostForForm.content, showForm]);


  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPostForForm(prev => ({ ...prev, title: e.target.value }));
  };

  const resetFormStates = () => {
    setShowForm(false);
    setCurrentPostForForm({});
    setIsEditing(false);
    setError(null);
    // Quill 인스턴스는 useEffect에서 자동으로 정리됨
  };
  
  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      setError("게시물을 작성하려면 로그인이 필요합니다.");
      alert("게시물을 작성하려면 로그인이 필요합니다.");
      navigate('/login');
      return;
    }

    const title = currentPostForForm.title?.trim();
    const content = quillInstanceRef.current?.root.innerHTML;

    if (!title || !content || content.trim() === '' || content.trim() === '<p><br></p>') {
      setError("제목과 내용은 비워둘 수 없습니다.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const postData: Partial<Omit<BoardPost, 'id' | 'createdAt' | 'updatedAt'>> & {category: BoardCategory} = {
        title: title,
        content: content,
        category: activeTab, 
        userId: currentUser.uid, // Use actual current user ID
        userName: currentUser.displayName || currentUser.email || '익명',
      };


      if (isEditing && currentPostForForm.id) {
        const postRef = doc(db, "boardPosts", currentPostForForm.id);
        await updateDoc(postRef, {
          title: postData.title,
          content: postData.content,
          category: postData.category, 
          updatedAt: serverTimestamp() as Timestamp,
        });
      } else {
        await addDoc(collection(db, "boardPosts"), {
          ...postData,
          createdAt: serverTimestamp() as Timestamp,
        });
      }
      resetFormStates();
      fetchPosts(); 
    } catch (err: any) {
      console.error("Error saving post:", err);
      if (err.code === 'unavailable') {
        setError("게시물을 저장하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError(err.message || "게시물을 저장하지 못했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (post: BoardPost) => {
    if (!currentUser || post.userId !== currentUser.uid) {
        alert("자신의 게시물만 수정할 수 있습니다.");
        return;
    }
    setCurrentPostForForm(post);
    setIsEditing(true);
    setShowForm(true);
  };
  
  const deleteImagesFromStorage = async (htmlContent: string) => {
    if (!htmlContent) return;
    const imageUrls = (htmlContent.match(/https:\/\/firebasestorage\.googleapis\.com[^\s"']+/g) || []);
    for (const url of imageUrls) {
        try {
            const imageRef = ref(storage, url);
            await deleteObject(imageRef);
        } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
                 console.warn(`Failed to delete image ${url} from storage:`, error);
            }
        }
    }
  };

  const handleDelete = async () => {
    if (!postToDelete) return;
     const postToActuallyDelete = posts.find(p => p.id === postToDelete);
     
     if (!postToActuallyDelete) {
         setError("삭제할 게시물을 찾을 수 없습니다.");
         setShowDeleteConfirm(false);
         setPostToDelete(null);
         return;
     }

     if (!currentUser || postToActuallyDelete.userId !== currentUser.uid) {
        alert("자신의 게시물만 삭제할 수 있습니다.");
        setShowDeleteConfirm(false);
        setPostToDelete(null);
        return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (postToActuallyDelete.content) {
        await deleteImagesFromStorage(postToActuallyDelete.content);
      }
      
      await deleteDoc(doc(db, "boardPosts", postToDelete));
      fetchPosts(); 
      setShowDeleteConfirm(false);
      setPostToDelete(null);
    } catch (err: any) {
      console.error("Error deleting post:", err);
      if (err.code === 'unavailable') {
        setError("게시물을 삭제하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setError(err.message || "게시물을 삭제하지 못했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const confirmDelete = (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!currentUser || post?.userId !== currentUser.uid) {
        alert("자신의 게시물만 삭제할 수 있습니다.");
        return;
    }
    setPostToDelete(postId);
    setShowDeleteConfirm(true);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center mb-4 sm:mb-0">
             <CurrentPageIcon className="w-8 h-8 text-primary-600 mr-3"/>
            <h1 className="text-2xl font-bold text-gray-800">{currentPageTitle}</h1>
        </div>
        <div className="flex items-center space-x-3">
          {!currentUser && (
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              로그인
            </button>
          )}
          <button
            onClick={handleCreatePostClick}
            className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <PlusCircleIcon className="w-5 h-5 mr-2" />
            {currentUser ? (showForm && !isEditing ? '양식 닫기' : '새 게시물 작성') : '새 게시물 작성'}
          </button>
        </div>
      </header>

      <div className="mb-6 bg-white p-2 rounded-lg shadow">
        <nav className="flex space-x-1" aria-label="Tabs">
          {boardCategories.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                ${activeTab === tab.key ? 'bg-primary-600 text-white shadow-md' : 'text-gray-600 hover:bg-primary-100 hover:text-primary-700'}
                px-4 py-2.5 font-medium text-sm rounded-md flex items-center transition-colors duration-150 ease-in-out
              `}
              aria-current={activeTab === tab.key ? 'page' : undefined}
            >
              <tab.icon className={`w-5 h-5 mr-2 ${activeTab === tab.key ? 'text-white' : 'text-primary-500'}`} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 비로그인 사용자를 위한 안내 메시지 */}
      {!currentUser && !loadingAuth && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <InformationCircleIcon className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">👀 게시판 둘러보기</p>
              <p>• 모든 게시물을 자유롭게 읽어보실 수 있습니다</p>
              <p>• 게시물 작성 및 댓글은 로그인 후 이용 가능합니다</p>
            </div>
          </div>
        </div>
      )}

      {showForm && currentUser && (
        <form onSubmit={handleSubmitPost} className="bg-white p-6 rounded-lg shadow-md space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">{isEditing ? '게시물 수정' : '새 게시물 작성'} ({currentPageTitle})</h2>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">제목</label>
            <input
              type="text"
              name="title"
              id="title"
              value={currentPostForForm.title ? currentPostForForm.title : ''}
              onChange={handleTitleChange}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2"
            />
          </div>
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700">내용</label>
            <div id="quill-editor-container" className="mt-1">
              <div ref={quillEditorRef}></div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={resetFormStates}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300"
            >
              {isSubmitting ? <Spinner size="sm" /> : (isEditing ? '게시물 업데이트' : '게시물 제출')}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2 flex-grow">{error}</p>}
        </form>
      )}
      
      {/* 로그인 프롬프트 모달 */}
      <Modal
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="로그인이 필요합니다"
        footer={
          <>
            <button
              onClick={() => setShowLoginPrompt(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={() => {
                setShowLoginPrompt(false);
                navigate('/login');
              }}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              로그인하러 가기
            </button>
          </>
        }
      >
        <div className="flex items-start">
          <InformationCircleIcon className="w-6 h-6 text-blue-500 mr-3 mt-1 flex-shrink-0" />
          <div>
            <p className="text-gray-700 mb-3">게시물 작성은 로그인한 사용자만 이용할 수 있습니다.</p>
            <div className="text-sm text-gray-600">
              <p>• 모든 게시물은 자유롭게 읽으실 수 있습니다</p>
              <p>• 게시물 작성, 수정, 삭제는 로그인 후 가능합니다</p>
            </div>
          </div>
        </div>
      </Modal>
      
      {isLoading && posts.length === 0 && <div className="flex justify-center py-8"><Spinner text={`${currentPageTitle} 게시물 로딩 중...`} /></div>}
      {!isLoading && posts.length === 0 && !showForm && (
        <div className="text-center py-10 bg-white p-6 rounded-lg shadow-md">
          <InformationCircleIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500">이 게시판에 아직 게시물이 없습니다. {currentUser ? "가장 먼저 공유해보세요!" : "게시물을 작성하려면 로그인하세요."}</p>
        </div>
      )}

      <div className="space-y-4">
        {posts.map(post => (
          <div key={post.id} className="bg-white p-4 sm:p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 border cursor-pointer"
               onClick={() => handleViewPost(post)}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex-grow min-w-0 pr-4">
                <h2 className="text-lg sm:text-xl font-semibold text-primary-700 break-words mb-2">{post.title}</h2>
                <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                  {getContentPreview(post.content || '', 120)}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center">
                    <UserCircleIcon className="w-4 h-4 mr-1 text-gray-400" />
                    <span>{post.userName || '익명'}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span>
                      {post.createdAt?.toDate().toLocaleDateString()}
                      {post.updatedAt && ` (수정됨)`}
                    </span>
                    <div className="flex items-center space-x-2">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-gray-400" />
                      <span>{commentCounts[post.id || ''] || 0}</span>
                    </div>
                    <EyeIcon className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>
              
              {currentUser && currentUser.uid === post.userId && (
                <div className="flex space-x-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(post);
                    }} 
                    className="p-2 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded-lg transition-all duration-200" 
                    title="게시물 수정"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      post.id && confirmDelete(post.id);
                    }} 
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-all duration-200" 
                    title="게시물 삭제"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="삭제 확인"
        footer={
          <>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300"
            >
              {isSubmitting ? <Spinner size="sm" /> : '삭제'}
            </button>
          </>
        }
      >
        <p>이 게시물을 삭제하시겠습니까? 게시물 내의 이미지도 함께 삭제되며 이 작업은 되돌릴 수 없습니다.</p>
      </Modal>
      
      <style>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ql-snow .ql-editor img {
          max-width: 100%;
          height: auto;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
          display: block; 
          margin-left: auto;
          margin-right: auto;
          border-radius: 0.25rem; 
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06); 
        }
        .ql-snow .ql-editor video {
          display: block;
          max-width: 100%;
          margin: 1rem auto;
        }
        .ql-editor { 
          min-height: 150px;
          font-size: 1rem;
          line-height: 1.6;
        }
        .prose.ql-snow .ql-editor {
            padding: 0; 
        }
        .prose.ql-snow .ql-editor p,
        .prose.ql-snow .ql-editor ul,
        .prose.ql-snow .ql-editor ol,
        .prose.ql-snow .ql-editor h1,
        .prose.ql-snow .ql-editor h2,
        .prose.ql-snow .ql-editor h3 {
            margin-bottom: 1em;
            margin-top: 1em;
        }
        .prose.ql-snow .ql-editor a {
             color: #3b82f6; 
             text-decoration: underline;
        }
        
        /* 커스텀 스크롤바 스타일 */
        .overflow-y-auto {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f1f5f9;
        }
        
        .overflow-y-auto::-webkit-scrollbar {
          width: 8px;
        }
        
        .overflow-y-auto::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 4px;
          border: 2px solid #f1f5f9;
        }
        
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
        
        /* 모달 내용 영역 스크롤바 */
        .max-h-96::-webkit-scrollbar,
        .max-h-80::-webkit-scrollbar {
          width: 6px;
        }
        
        .max-h-96::-webkit-scrollbar-thumb,
        .max-h-80::-webkit-scrollbar-thumb {
          background-color: #e2e8f0;
          border-radius: 3px;
        }
        
        .max-h-96::-webkit-scrollbar-thumb:hover,
        .max-h-80::-webkit-scrollbar-thumb:hover {
          background-color: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

export default BoardPage;
