import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface PhotoAnalysisResultItem {
  hazards: string[];
  engineeringSolutions: string[];
  managementSolutions: string[];
  relatedRegulations: string[];
}

export interface PhotoAnalysis {
  id?: string;
  userId: string;
  photoUrl: string; // Firebase Storage URL
  imageFileName: string;
  description?: string; // Optional user description of the photo
  result: PhotoAnalysisResultItem | null;
  createdAt: Timestamp;
  error?: string; // To store any error message during analysis
}

export interface HazardItem {
  id: string; // for unique key in UI lists
  description: string;
  severity: number; // 1-5
  likelihood: number; // 1-5
  countermeasures: string;
}

export interface RiskAssessment {
  id?: string;
  userId: string;
  title: string; // User-defined title for the assessment
  processName: string;
  createdAt: Timestamp;
  photos: { url: string, name: string }[]; // Array of Firebase Storage URLs and file names
  hazards: HazardItem[];
  adminComment: string;
}

export type BoardCategory = 'safetyInfo' | 'jobPostings';

export interface BoardPost {
  id?: string;
  userId: string;
  userName?: string; // Store displayName for easier access
  category: BoardCategory; // Added category to distinguish boards
  title: string;
  content: string; // Will store HTML content from Quill editor
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// 게시판 댓글 인터페이스
export interface BoardComment {
  id?: string;
  postId: string; // 어떤 게시물의 댓글인지
  userId: string;
  userName?: string; // 댓글 작성자 이름
  content: string; // 댓글 내용
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// For Gemini API service responses before they are mapped to PhotoAnalysisResultItem or HazardItem[]
export interface GeminiRawPhotoAnalysis {
  hazards?: string[];
  engineeringSolutions?: string[];
  managementSolutions?: string[];
  relatedRegulations?: string[];
}

export interface GeminiRawHazardItem {
  description?: string;
  severity?: number;
  likelihood?: number;
  countermeasures?: string;
}