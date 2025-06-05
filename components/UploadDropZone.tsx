import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArrowUpTrayIcon } from './Icons';
import Spinner from './Spinner';

interface UploadDropZoneProps {
  onFileChange: (file: File | null) => void;
  label?: string;
  acceptedFileTypes?: string; // e.g., "image/jpeg, image/png"
}

const UploadDropZone: React.FC<UploadDropZoneProps> = ({ 
  onFileChange, 
  label = "이미지 업로드",
  acceptedFileTypes = "image/jpeg, image/png, image/gif" 
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [fileSize, setFileSize] = useState<string | null>(null);

  // 파일 크기를 읽기 쉬운 형태로 변환
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 이미지 압축 함수
  const compressImage = (file: File, maxSizeInMB: number = 1): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // 원본 크기
        let { width, height } = img;
        
        // 압축률 계산 (1MB 기준)
        const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
        const currentSizeInBytes = file.size;
        
        if (currentSizeInBytes <= maxSizeInBytes) {
          resolve(file); // 압축 불필요
          return;
        }

        // 더 적극적인 크기 조정 비율 계산
        let compressionRatio = Math.sqrt(maxSizeInBytes / currentSizeInBytes);
        
        // 매우 큰 파일의 경우 추가로 해상도 감소
        if (currentSizeInBytes > 5 * 1024 * 1024) { // 5MB 이상
          compressionRatio *= 0.7; // 추가 30% 크기 감소
        }
        
        // 최소 해상도 보장 (너무 작아지지 않도록)
        const minWidth = 400;
        const minHeight = 300;
        
        width = Math.max(Math.floor(width * compressionRatio), minWidth);
        height = Math.max(Math.floor(height * compressionRatio), minHeight);

        // Canvas 크기 설정
        canvas.width = width;
        canvas.height = height;

        // 이미지 그리기 (고품질 스케일링)
        ctx?.drawImage(img, 0, 0, width, height);

        // 여러 단계 압축 시도
        const tryCompress = (quality: number): Promise<File> => {
          return new Promise((resolveCompress, rejectCompress) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const compressedFile = new File(
                    [blob], 
                    file.name, 
                    { 
                      type: file.type,
                      lastModified: Date.now()
                    }
                  );
                  
                  // 1MB 이하가 되었는지 확인
                  if (compressedFile.size <= maxSizeInBytes || quality <= 0.3) {
                    resolveCompress(compressedFile);
                  } else {
                    // 품질을 더 낮춰서 재시도
                    tryCompress(quality - 0.1).then(resolveCompress).catch(rejectCompress);
                  }
                } else {
                  rejectCompress(new Error('이미지 압축에 실패했습니다.'));
                }
              },
              file.type,
              quality
            );
          });
        };

        // 0.6 품질부터 시작해서 점진적으로 낮춤
        tryCompress(0.6).then(resolve).catch(reject);
      };

      img.onerror = () => reject(new Error('이미지 로드에 실패했습니다.'));
      img.src = URL.createObjectURL(file);
    });
  };

  const processFile = async (file: File) => {
    try {
      setIsCompressing(true);
      setError(null);

      const originalSize = formatFileSize(file.size);
      
      // 1MB 이상인 경우 압축
      let processedFile = file;
      if (file.size > 1 * 1024 * 1024) {
        console.log(`압축 시작: ${originalSize}`);
        processedFile = await compressImage(file, 1);
        const compressedSize = formatFileSize(processedFile.size);
        console.log(`압축 완료: ${originalSize} → ${compressedSize}`);
        setFileSize(`원본: ${originalSize} → 압축: ${compressedSize}`);
      } else {
        setFileSize(originalSize);
      }

      setFileName(processedFile.name);
      onFileChange(processedFile);

      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(processedFile);

    } catch (err) {
      console.error('파일 처리 중 오류:', err);
      setError('이미지 처리 중 오류가 발생했습니다.');
      onFileChange(null);
      setPreview(null);
      setFileName(null);
      setFileSize(null);
    } finally {
      setIsCompressing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setError(null);
    if (fileRejections.length > 0) {
        setError(fileRejections[0].errors[0].message || "잘못된 파일 형식입니다.");
        onFileChange(null);
        setPreview(null);
        setFileName(null);
        setFileSize(null);
        return;
    }
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      processFile(file);
    } else {
      onFileChange(null);
      setPreview(null);
      setFileName(null);
      setFileSize(null);
    }
  }, [onFileChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes ? acceptedFileTypes.split(',').reduce((acc, type) => {
        acc[type.trim()] = [];
        return acc;
    }, {} as Record<string, string[]>) : undefined,
    multiple: false,
    maxSize: 50 * 1024 * 1024, // 50MB 최대 업로드 크기
  });

  const handleRemoveImage = () => {
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    onFileChange(null);
    setError(null);
     // Reset the input value to allow re-uploading the same file
    const inputElement = document.getElementById('file-upload-input') as HTMLInputElement;
    if (inputElement) {
        inputElement.value = "";
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div
        {...getRootProps()}
        className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${
          isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
        } border-dashed rounded-md cursor-pointer hover:border-primary-400 transition-colors duration-200 ease-in-out ${
          isCompressing ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <input {...getInputProps()} id="file-upload-input" className="sr-only" />
        {isCompressing ? (
          <div className="space-y-2 text-center">
            <Spinner size="lg" />
            <p className="text-sm text-gray-600">이미지 처리 중...</p>
            <p className="text-xs text-gray-500">1MB 이하로 압축하고 있습니다.</p>
          </div>
        ) : preview ? (
          <div className="relative group">
            <img src={preview} alt="미리보기" className="max-h-48 rounded-md object-contain" />
            <div 
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="mt-1 text-center">
              <p className="text-xs text-gray-600 truncate w-48">{fileName}</p>
              {fileSize && (
                <p className="text-xs text-green-600 mt-1">{fileSize}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-center">
            <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <p className="pl-1">
                {isDragActive ? "여기에 파일을 드롭하세요..." : "이미지를 드래그 앤 드롭하거나 클릭하여 선택하세요"}
              </p>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG, GIF</p>
            <p className="text-xs text-blue-600 font-medium">📦 1MB 이상의 이미지는 자동으로 1MB 이하로 압축됩니다</p>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default UploadDropZone;