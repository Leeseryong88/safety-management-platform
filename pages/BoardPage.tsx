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
  { key: 'freeBoard', label: '자유게시판', icon: ChatBubbleLeftRightIcon },
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

  const [writeMode, setWriteMode] = useState<boolean>(false);
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

  // 게시물 내용에서 첫 번째 이미지 URL 추출하는 함수
  const getFirstImageUrl = (htmlContent: string): string | null => {
    if (!htmlContent) return null;
    
    try {
      console.log('HTML Content to parse:', htmlContent);
      
      // DOMPurify로 정리된 HTML을 사용하여 이미지 추출
      const cleanHtml = DOMPurify.sanitize(htmlContent);
      console.log('Clean HTML:', cleanHtml);
      
      // DOM 파서를 사용하여 더 정확하게 이미지 추출
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleanHtml, 'text/html');
      const imgElement = doc.querySelector('img');
      
      if (imgElement && imgElement.src) {
        console.log('Found image URL using DOM parser:', imgElement.src);
        return imgElement.src;
      }
      
      // DOM으로 찾지 못했을 경우 원본 HTML에서 정규식 사용
      const imgPatterns = [
        /<img[^>]*src=["']([^"']+)["'][^>]*>/gi,  // 일반적인 img 태그
        /<img[^>]*src=([^>\s"']+)[^>]*>/gi,       // 따옴표 없는 src
        /src=["']([^"']*firebasestorage[^"']*)["']/gi, // Firebase Storage URL 특별 처리
        /https:\/\/firebasestorage\.googleapis\.com[^\s"'<>]+/gi, // Firebase URL 직접 추출
      ];
      
      for (const pattern of imgPatterns) {
        let match;
        while ((match = pattern.exec(htmlContent)) !== null) {
          if (match[1]) {
            console.log('Found image URL using regex pattern:', pattern.source, 'URL:', match[1]);
            return match[1];
          } else if (match[0] && match[0].startsWith('https://firebasestorage')) {
            console.log('Found Firebase URL directly:', match[0]);
            return match[0];
          }
        }
      }
      
      console.log('No image found in content. Content length:', htmlContent.length);
      return null;
    } catch (error) {
      console.error('Error extracting image URL:', error);
      return null;
    }
  };

  // 기본 썸네일 이미지 (카테고리별)
  const getDefaultThumbnail = (category: BoardCategory): string => {
    // 간단한 SVG를 직접 문자열로 생성
    const svgImages = {
      safetyInfo: `data:image/svg+xml,${encodeURIComponent(`
        <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#EEF2FF"/>
          <path d="M50 25L25 37.5V62.5H75V37.5L50 25Z" fill="#3B82F6"/>
        </svg>
      `)}`,
      freeBoard: `data:image/svg+xml,${encodeURIComponent(`
        <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#FDF2F8"/>
          <circle cx="30" cy="30" r="6" fill="#EC4899"/>
          <circle cx="70" cy="30" r="6" fill="#EC4899"/>
          <circle cx="50" cy="50" r="6" fill="#EC4899"/>
          <circle cx="30" cy="70" r="6" fill="#EC4899"/>
          <circle cx="70" cy="70" r="6" fill="#EC4899"/>
        </svg>
      `)}`
    };
    return svgImages[category];
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
    
    setCurrentPostForForm({ category: activeTab }); 
    setIsEditing(false);
    setWriteMode(true);
  };

  useEffect(() => {
    fetchPosts();
    resetFormStates(); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchPosts]);

  // 커스텀 이미지 리사이징 기능
  const addImageResizeHandlers = useCallback((img: HTMLImageElement) => {
    console.log('Adding resize handlers to image:', img.src);
    
    // 이미지가 이미 리사이즈 기능이 있는지 확인
    if (img.dataset.resizeHandlersAdded === 'true') {
      console.log('Image already has resize handlers');
      return;
    }

    // 리사이즈 기능 추가 표시
    img.dataset.resizeHandlersAdded = 'true';

    // 이미지 호버 시 시각적 피드백
    let isHovering = false;
    let isResizing = false;
    
    const showResize = () => {
      isHovering = true;
      img.style.outline = '2px dashed #007bff';
      img.style.cursor = 'se-resize';
      img.title = '드래그하여 크기 조절 (우하단에서 시작)';
    };

    const hideResize = () => {
      if (!isResizing) {
        isHovering = false;
        img.style.outline = 'none';
        img.style.cursor = 'default';
        img.title = '';
      }
    };

    // 이미지에 호버 이벤트 추가
    img.addEventListener('mouseenter', showResize);
    img.addEventListener('mouseleave', hideResize);

    // 리사이징 기능
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    
    const startResize = (e: MouseEvent) => {
      // 우하단 영역에서만 리사이징 시작 (이미지의 마지막 20px 영역)
      const rect = img.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      if (x < rect.width - 20 || y < rect.height - 20) {
        return; // 우하단이 아니면 리사이징 안함
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Starting resize');
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = img.offsetWidth;
      startHeight = img.offsetHeight;
      
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
      document.body.style.userSelect = 'none';
      
      // 리사이징 중 시각적 피드백
      img.style.outline = '2px solid #007bff';
      img.style.cursor = 'se-resize';
    };
    
    const doResize = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      let newWidth = startWidth + deltaX;
      
      // 크기 제한
      newWidth = Math.max(100, Math.min(800, newWidth));
      
      img.style.width = newWidth + 'px';
      img.style.height = 'auto';
      
      console.log('Resizing to width:', newWidth);
    };
    
    const stopResize = () => {
      console.log('Stopping resize');
      isResizing = false;
      document.removeEventListener('mousemove', doResize);
      document.removeEventListener('mouseup', stopResize);
      document.body.style.userSelect = '';
      
      if (!isHovering) {
        hideResize();
      }
    };

    // 이미지에 마우스다운 이벤트 추가
    img.addEventListener('mousedown', startResize);

    // 더블클릭으로 원본 크기 복원
    img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      img.style.width = '400px';
      img.style.height = 'auto';
      console.log('Reset to original size');
    });

    console.log('Image resize handlers added successfully');
  }, []);

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
    // 작성 모드가 아닐 때 Quill 인스턴스 정리
    if (!writeMode) {
      cleanupQuillInstance();
      return;
    }

    // 사용자가 로그인하지 않았으면 작성 모드 종료
    if (!currentUser) {
      setWriteMode(false);
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
            ]
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
                  
                  console.log('Image inserted with URL:', downloadURL);
                  
                  // 이미지 삽입 후 리사이징 기능 추가
                  setTimeout(() => {
                    const editor = quillInstanceRef.current?.root;
                    if (editor) {
                      const images = editor.querySelectorAll('img');
                      console.log('Total images in editor:', images.length);
                      
                      const lastImage = images[images.length - 1] as HTMLImageElement;
                      if (lastImage) {
                        console.log('Last image src:', lastImage.src);
                        
                        // 기본 스타일 적용
                        lastImage.style.width = '400px';
                        lastImage.style.height = 'auto';
                        lastImage.style.display = 'block';
                        lastImage.style.marginLeft = 'auto';
                        lastImage.style.marginRight = 'auto';
                        lastImage.style.maxWidth = '100%';
                        
                        // 이미지 로드 완료 후 리사이징 기능 추가
                        if (lastImage.complete) {
                          console.log('Image already loaded, adding resize handlers');
                          addImageResizeHandlers(lastImage);
                        } else {
                          lastImage.onload = () => {
                            console.log('Image loaded, adding resize handlers');
                            addImageResizeHandlers(lastImage);
                          };
                          lastImage.onerror = () => {
                            console.error('Image failed to load');
                          };
                        }
                      }
                    }
                  }, 100);
                  
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
  }, [writeMode, currentUser, cleanupQuillInstance]);

  // 편집 모드 변경 시 내용 업데이트 (별도 useEffect로 분리)
  useEffect(() => {
    if (quillInstanceRef.current && writeMode) {
      if (isEditing && currentPostForForm.content) {
        quillInstanceRef.current.root.innerHTML = currentPostForForm.content;
        // 기존 이미지들에 리사이징 기능 추가
        setTimeout(() => {
          const images = quillInstanceRef.current!.root.querySelectorAll('img');
          console.log('Loaded images in edit mode:', images.length);
          
          images.forEach((img, index) => {
            const htmlImg = img as HTMLImageElement;
            if (htmlImg.complete) {
              console.log(`Adding resize handlers to existing image ${index + 1}`);
              addImageResizeHandlers(htmlImg);
            } else {
              htmlImg.onload = () => {
                console.log(`Image ${index + 1} loaded, adding resize handlers`);
                addImageResizeHandlers(htmlImg);
              };
            }
          });
        }, 200);
      } else if (!isEditing) {
        quillInstanceRef.current.root.innerHTML = '';
      }
    }
  }, [isEditing, currentPostForForm.content, writeMode, addImageResizeHandlers]);


  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPostForForm(prev => ({ ...prev, title: e.target.value }));
  };

  const resetFormStates = () => {
    setWriteMode(false);
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
    setWriteMode(true);
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
            onClick={writeMode ? resetFormStates : handleCreatePostClick}
            className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <PlusCircleIcon className="w-5 h-5 mr-2" />
            {writeMode ? (isEditing ? '수정 취소' : '작성 취소') : '새 게시물 작성'}
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

      {/* 게시글 작성/수정 페이지 */}
      {writeMode && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">
              {isEditing ? '게시물 수정' : '새 게시물 작성'} ({currentPageTitle})
            </h2>
            <button
              onClick={resetFormStates}
              className="flex items-center px-3 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ← 취소
            </button>
          </div>
          
          <form onSubmit={handleSubmitPost} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">제목</label>
              <input
                type="text"
                name="title"
                id="title"
                value={currentPostForForm.title ? currentPostForForm.title : ''}
                onChange={handleTitleChange}
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base p-3"
                placeholder="게시물 제목을 입력하세요"
              />
            </div>
            
            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">내용</label>
              <div id="quill-editor-container" className="border border-gray-300 rounded-md">
                <div ref={quillEditorRef} style={{ minHeight: '300px' }}></div>
              </div>
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            <div className="flex justify-end space-x-3 pt-6 border-t">
              <button
                type="button"
                onClick={resetFormStates}
                className="px-6 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300"
              >
                {isSubmitting ? <Spinner size="sm" /> : (isEditing ? '게시물 업데이트' : '게시물 제출')}
              </button>
            </div>
          </form>
        </div>
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
      
      {/* 게시물 목록 - 작성 모드가 아닐 때만 표시 */}
      {!writeMode && (
        <>
          {isLoading && posts.length === 0 && <div className="flex justify-center py-8"><Spinner text={`${currentPageTitle} 게시물 로딩 중...`} /></div>}
          {!isLoading && posts.length === 0 && (
            <div className="text-center py-10 bg-white p-6 rounded-lg shadow-md">
              <InformationCircleIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500">이 게시판에 아직 게시물이 없습니다. {currentUser ? "가장 먼저 공유해보세요!" : "게시물을 작성하려면 로그인하세요."}</p>
            </div>
          )}

          <div className="space-y-1">
        {posts.map(post => {
          const extractedImageUrl = getFirstImageUrl(post.content || '');
          const defaultThumbnail = getDefaultThumbnail(post.category);
          const thumbnailUrl = extractedImageUrl || defaultThumbnail;
          const commentCount = commentCounts[post.id || ''] || 0;
          
          // 디버깅용 로그
          console.log('=== Post Debug Info ===');
          console.log('Title:', post.title);
          console.log('Has content:', !!post.content);
          console.log('Content preview:', post.content?.substring(0, 200));
          console.log('Extracted image URL:', extractedImageUrl);
          console.log('Using default thumbnail:', !extractedImageUrl);
          console.log('Final thumbnail URL:', thumbnailUrl);
          console.log('======================');
          
          return (
            <div key={post.id} className="bg-white rounded shadow hover:shadow-md transition-shadow duration-200 border cursor-pointer overflow-hidden"
                 onClick={() => handleViewPost(post)}>
              <div className="flex">
                {/* 썸네일 이미지 */}
                <div className="flex-shrink-0 w-16 h-14 sm:w-20 sm:h-16 bg-gray-100 rounded-l">
                  <img
                    src={thumbnailUrl}
                    alt={post.title || '게시물 썸네일'}
                    className="w-full h-full object-cover rounded-l"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      console.log('Image error for URL:', target.src);
                      console.log('Falling back to default thumbnail for category:', post.category);
                      const fallbackUrl = getDefaultThumbnail(post.category);
                      if (target.src !== fallbackUrl) {
                        target.src = fallbackUrl;
                      }
                    }}
                    onLoad={() => {
                      console.log('Image loaded successfully:', thumbnailUrl);
                    }}
                  />
                </div>
                
                {/* 게시물 정보 */}
                <div className="flex-1 p-2 sm:p-3 min-w-0">
                  <div className="flex justify-between items-start h-full">
                    <div className="flex-1 min-w-0 mr-1">
                      {/* 제목과 댓글 수 */}
                      <div className="mb-2">
                        <h3 className="text-xs sm:text-sm font-medium text-gray-900 inline">
                          {post.title}
                        </h3>
                        <span className="text-red-500 font-medium text-xs ml-1">
                          [{commentCount}]
                        </span>
                      </div>
                      
                      {/* 메타 정보 */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <UserCircleIcon className="w-3 h-3 text-gray-400" />
                          <span className="truncate max-w-16 sm:max-w-20">{post.userName || '익명'}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <span className="text-gray-400">
                            {post.createdAt?.toDate().toLocaleDateString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit'
                            })}
                          </span>
                          <span className="text-gray-400">
                            {post.createdAt?.toDate().toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* 수정/삭제 버튼 */}
                    {currentUser && currentUser.uid === post.userId && (
                      <div className="flex flex-col space-y-0.5 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(post);
                          }} 
                          className="p-0.5 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded transition-all duration-200" 
                          title="게시물 수정"
                        >
                          <PencilIcon className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            post.id && confirmDelete(post.id);
                          }} 
                          className="p-0.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200" 
                          title="게시물 삭제"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
          })}
          </div>
        </>
      )}
      
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
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
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
          cursor: pointer; /* 클릭 가능하다는 것을 알려주는 커서 */
        }
        
        /* 리사이즈 핸들 스타일 */
        .ql-snow .ql-editor img:hover {
          box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.15), 0 2px 4px 0 rgba(0, 0, 0, 0.1);
        }
        
        /* 이미지 리사이즈 최적화 스타일 */
        .ql-editor {
          position: relative;
        }
        
        /* 리사이징 중 성능 최적화 */
        .ql-editor img {
          will-change: transform, width, height;
        }
        
        /* 리사이즈 핸들 최적화 */
        .ql-editor .img-resize-overlay {
          pointer-events: none;
        }
        
        .ql-editor .img-resize-handle {
          pointer-events: all;
          will-change: transform;
        }
        
        /* 리사이징 중 이미지 최적화 */
        .ql-editor img.resizing {
          image-rendering: optimizeSpeed;
          image-rendering: -webkit-optimize-contrast;
          transform: translateZ(0); /* GPU 가속 */
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
