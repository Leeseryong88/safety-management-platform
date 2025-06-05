import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Spinner from '../components/Spinner';
import { answerSafetyQuestion, fileToBase64 } from '../lib/gemini';
import { useAuth } from '../components/Layout';
import { ChatBubbleLeftRightIcon, InformationCircleIcon, UserCircleIcon, PlusCircleIcon, CameraIcon, TrashIcon } from '../components/Icons';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  imageUrl?: string; // 이미지 미리보기용
}

const AiQaPage: React.FC = () => {
  const { currentUser, loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [question, setQuestion] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // 이미지 업로드 관련 상태
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loadingAuth && !currentUser) {
      navigate('/login', { state: { from: location }, replace: true });
    }
  }, [currentUser, loadingAuth, navigate, location]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 이미지 압축 함수 (UploadDropZone에서 가져옴)
  const compressImage = async (file: File): Promise<File> => {
    const maxSizeInBytes = 1 * 1024 * 1024; // 1MB
    
    if (file.size <= maxSizeInBytes) {
      return file;
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;
        let quality = 0.6;

        // 매우 큰 파일(5MB+)의 경우 해상도도 줄임
        if (file.size > 5 * 1024 * 1024) {
          const scaleFactor = 0.7;
          width *= scaleFactor;
          height *= scaleFactor;
        }

        // 최소 해상도 보장
        const minWidth = 400;
        const minHeight = 300;
        if (width < minWidth || height < minHeight) {
          const scaleW = minWidth / width;
          const scaleH = minHeight / height;
          const scale = Math.max(scaleW, scaleH);
          width *= scale;
          height *= scale;
        }

        canvas.width = width;
        canvas.height = height;

        const tryCompress = () => {
          ctx?.clearRect(0, 0, width, height);
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              if (blob.size <= maxSizeInBytes || quality <= 0.3) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                quality -= 0.1;
                tryCompress();
              }
            } else {
              resolve(file);
            }
          }, 'image/jpeg', quality);
        };

        tryCompress();
      };

      img.src = URL.createObjectURL(file);
    });
  };

  // 이미지 선택 처리
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 이미지 파일 타입 확인
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setIsCompressing(true);
    setError(null);

    try {
      // 이미지 압축
      const compressedFile = await compressImage(file);
      setSelectedImage(compressedFile);
      
      // 미리보기 생성
      const previewUrl = URL.createObjectURL(compressedFile);
      setImagePreview(previewUrl);
    } catch (err) {
      console.error('Image compression error:', err);
      setError('이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsCompressing(false);
    }
  };

  // 이미지 제거
  const removeImage = () => {
    setSelectedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 새 대화 시작 (현재 세션 초기화)
  const startNewConversation = () => {
    setMessages([]);
    setError(null);
    removeImage();
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!question.trim() && !selectedImage) || !currentUser) return;

    const questionText = question.trim() || '이 이미지를 분석해주세요.';
    
    const userMessage: Message = {
      id: Date.now().toString() + 'user',
      text: questionText,
      sender: 'user',
      timestamp: new Date(),
      imageUrl: imagePreview || undefined,
    };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setQuestion('');
    setIsLoading(true);
    setError(null);

    try {
      // 대화 히스토리 구성 (현재 세션의 이전 대화)
      const conversationHistory = messages.map(msg => ({
        text: msg.text,
        sender: msg.sender
      }));

      // 이미지 데이터 준비
      let imageData: {base64: string, mimeType: string} | undefined;
      if (selectedImage) {
        const base64 = await fileToBase64(selectedImage);
        imageData = {
          base64,
          mimeType: selectedImage.type
        };
      }

      const aiResponseText = await answerSafetyQuestion(questionText, conversationHistory, imageData);
      const aiMessage: Message = {
        id: Date.now().toString() + 'ai',
        text: aiResponseText,
        sender: 'ai',
        timestamp: new Date(),
      };
      
      setMessages([...newMessages, aiMessage]);
      
      // 이미지 정리
      removeImage();
      
    } catch (err: any) {
      console.error("AI Chatbot error:", err);
      const errorMessageText = err.message || "답변을 가져오는 중 오류가 발생했습니다.";
      setError(errorMessageText);
      const errorMessage: Message = {
        id: Date.now().toString() + 'ai-error',
        text: `오류: ${errorMessageText}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (loadingAuth || !currentUser) {
    return <div className="flex justify-center items-center h-full"><Spinner text="인증 정보 로딩 중..." /></div>;
  }

  return (
    <div className="container mx-auto p-4 flex flex-col h-[calc(100vh-12rem)]">
      <header className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-primary-600 mr-3"/>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">AI 안전 챗봇</h1>
              <p className="text-gray-600 mt-1">AI 안전 챗봇에게 산업 안전 규정, 절차 또는 모범 사례에 대해 질문하거나 이미지를 분석 요청하세요.</p>
            </div>
          </div>
          
          <button
            onClick={startNewConversation}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center"
          >
            <PlusCircleIcon className="w-5 h-5 mr-2" />
            새 대화
          </button>
        </div>
      </header>

      <div className="flex-grow overflow-y-auto bg-white p-6 rounded-lg shadow-md mb-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            <InformationCircleIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>아직 메시지가 없습니다. 아래에 질문을 입력하거나 이미지를 업로드하여 대화를 시작하세요!</p>
            <p className="text-sm text-gray-400 mt-2">AI가 대화의 맥락을 기억하고 이미지 분석도 함께 제공합니다.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-lg p-3 rounded-lg shadow ${
                msg.sender === 'user' 
                  ? 'bg-primary-500 text-white' 
                  : msg.text.startsWith('오류:') ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-800'
              }`}
            >
              <div className="flex items-start mb-1">
                {msg.sender === 'ai' && (
                  <ChatBubbleLeftRightIcon className="w-5 h-5 mr-2 flex-shrink-0 text-primary-700" />
                )}
                 {msg.sender === 'user' && (
                   currentUser?.photoURL ? 
                   <img src={currentUser.photoURL} alt="user" className="w-5 h-5 rounded-full mr-2 flex-shrink-0" /> :
                   <UserCircleIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                )}
                <div className="flex-grow">
                  {/* 이미지 미리보기 */}
                  {msg.imageUrl && (
                    <img 
                      src={msg.imageUrl} 
                      alt="업로드된 이미지" 
                      className="max-w-full h-auto rounded-lg mb-2 max-h-48 object-contain"
                    />
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
              <p className={`text-xs ${msg.sender === 'user' ? 'text-primary-200 text-right' : 'text-gray-500 text-left'}`}>
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-lg p-3 rounded-lg shadow bg-gray-200 text-gray-800">
              <Spinner size="sm" text="AI가 분석 중입니다..." />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {error && !messages.find(m => m.text.includes(error||"")) && (
        <p className="text-red-500 text-sm mb-2 p-2 bg-red-100 rounded">{error}</p>
      )}
      
      {/* 이미지 미리보기 및 압축 상태 */}
      {(imagePreview || isCompressing) && (
        <div className="bg-white p-4 rounded-lg shadow-md mb-4">
          {isCompressing ? (
            <div className="flex items-center text-blue-600">
              <Spinner size="sm" />
              <span className="ml-2">1MB 이하로 압축하고 있습니다...</span>
            </div>
          ) : imagePreview ? (
            <div className="flex items-center space-x-3">
              <img 
                src={imagePreview} 
                alt="선택된 이미지" 
                className="w-16 h-16 object-cover rounded-lg border"
              />
              <div className="flex-grow">
                <p className="text-sm text-gray-700">이미지가 선택되었습니다</p>
                <p className="text-xs text-gray-500">
                  {selectedImage && `${(selectedImage.size / 1024).toFixed(1)}KB`}
                </p>
              </div>
              <button
                onClick={removeImage}
                className="p-2 text-red-500 hover:text-red-700 transition-colors"
                title="이미지 제거"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          ) : null}
        </div>
      )}
      
      <form onSubmit={handleAskQuestion} className="bg-white p-4 rounded-lg shadow-md">
        <div className="flex items-end space-x-3">
          <div className="flex-grow">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={selectedImage ? "이미지에 대한 질문을 입력하세요... (선택사항)" : "안전 관련 질문을 여기에 입력하세요..."}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
              disabled={isLoading || isCompressing}
            />
          </div>
          
          {/* 이미지 업로드 버튼 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isCompressing}
            className="px-4 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-300 transition-colors"
            title="이미지 업로드"
          >
            <CameraIcon className="w-5 h-5" />
          </button>
          
          <button
            type="submit"
            disabled={isLoading || isCompressing || (!question.trim() && !selectedImage)}
            className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-400 transition-colors"
          >
            {isLoading ? <Spinner size="sm" /> : '전송'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AiQaPage;
