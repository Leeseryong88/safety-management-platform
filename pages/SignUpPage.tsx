import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase'; 
import { createUserWithEmailAndPassword, updateProfile, AuthError } from 'firebase/auth';
import Spinner from '../components/Spinner';
import { useAuth } from '../components/Layout'; 

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (currentUser) {
    navigate('/'); 
    return null;
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!agreedToTerms || !agreedToPrivacy) {
      setError('이용약관과 개인정보처리방침에 모두 동의해야 합니다.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        if (displayName.trim()) {
          await updateProfile(userCredential.user, { displayName: displayName.trim() });
        }
        // Firestore user document creation is handled by onAuthStateChanged in AuthProvider (Layout.tsx)
        navigate('/'); 
      }
    } catch (err) {
      const authError = err as AuthError;
      if (authError.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다.');
      } else if (authError.code === 'auth/weak-password') {
        setError('비밀번호가 너무 약합니다. 6자 이상으로 설정해주세요.');
      } else if (authError.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일 형식입니다.');
      }
      else {
        setError('회원가입 중 오류가 발생했습니다: ' + authError.message);
        console.error("Sign up error:", authError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            계정 만들기
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
              로그인하기
            </Link>
             {/* The comment about Google login might be specific to LoginPage's implementation */}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSignUp}>
          {error && <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md text-center">{error}</p>}
          
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="displayName" className="sr-only">이름 (선택)</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="이름 (선택 사항)"
              />
            </div>
            <div>
              <label htmlFor="email-address" className="sr-only">이메일 주소</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="이메일 주소"
              />
            </div>
            <div>
              <label htmlFor="password_signup" className="sr-only">비밀번호</label>
              <input
                id="password_signup"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호 (6자 이상)"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="sr-only">비밀번호 확인</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호 확인"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <input
                id="terms-agreement"
                name="terms-agreement"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="terms-agreement" className="ml-2 block text-sm text-gray-900">
                <Link to="/terms" target="_blank" className="font-medium text-primary-600 hover:text-primary-500">이용약관</Link>에 동의합니다. (필수)
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="privacy-agreement"
                name="privacy-agreement"
                type="checkbox"
                checked={agreedToPrivacy}
                onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="privacy-agreement" className="ml-2 block text-sm text-gray-900">
                <Link to="/privacy" target="_blank" className="font-medium text-primary-600 hover:text-primary-500">개인정보처리방침</Link>에 동의합니다. (필수)
              </label>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || !agreedToTerms || !agreedToPrivacy}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-400"
            >
              {isLoading ? <Spinner size="sm" color="text-white" /> : '계정 만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUpPage;
