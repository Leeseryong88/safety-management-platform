import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout, { AuthProvider } from './components/Layout'; // Ensured relative path
import HomePage from './pages/HomePage'; // Ensured relative path
import PhotoAnalysisPage from './pages/PhotoAnalysisPage'; // Ensured relative path
import RiskAssessmentPage from './pages/RiskAssessmentPage'; // Ensured relative path
import AiQaPage from './pages/AiQaPage'; // Ensured relative path
import BoardPage from './pages/BoardPage'; // Ensured relative path
import PostDetailPage from './pages/PostDetailPage'; // 게시물 상세 페이지
import SignUpPage from './pages/SignUpPage'; // Ensured relative path
import LoginPage from './pages/LoginPage'; // Ensured relative path
import TermsPage from './pages/TermsPage'; // Ensured relative path
import PrivacyPage from './pages/PrivacyPage'; // Ensured relative path
import NotFoundPage from './pages/NotFoundPage'; // Ensured relative path

const App: React.FC = () => {
  return (
    <AuthProvider> {/* Wrap Routes with AuthProvider */}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="photo-analysis" element={<PhotoAnalysisPage />} />
          <Route path="risk-assessment" element={<RiskAssessmentPage />} />
          <Route path="ai-qa" element={<AiQaPage />} />
          <Route path="board" element={<BoardPage />} /> {/* Updated: Single route for boards */}
          <Route path="post/:postId" element={<PostDetailPage />} /> {/* 게시물 상세 페이지 */}
          <Route path="signup" element={<SignUpPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
};

export default App;