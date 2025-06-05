import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, AuthError } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../components/Layout';
import Spinner from '../components/Spinner';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, signInWithGoogle, loadingAuth } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (!loadingAuth && currentUser) {
      navigate(from, { replace: true });
    }
  }, [currentUser, loadingAuth, navigate, from]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Navigation is handled by the useEffect hook watching currentUser
    } catch (err) {
      const authError = err as AuthError;
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        setError('이메일 또는 비밀번호가 잘못되었습니다.');
      } else if (authError.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일 형식입니다.');
      } else {
        setError('로그인 중 오류가 발생했습니다: ' + authError.message);
        console.error("Login error:", authError);
      }
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Navigation is handled by the useEffect hook watching currentUser
    } catch (err) {
      const authError = err as AuthError;
      setError('Google 로그인 중 오류가 발생했습니다: ' + authError.message);
      console.error("Google sign-in error:", authError);
      setIsGoogleLoading(false);
    }
  };
  
  if (loadingAuth && !currentUser) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
        <Spinner text="인증 정보를 확인 중입니다..." />
      </div>
    );
  }


  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            로그인
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            아직 계정이 없으신가요?{' '}
            <Link to="/signup" className="font-medium text-primary-600 hover:text-primary-500">
              회원가입하기
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md text-center">{error}</p>}
          
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address-login" className="sr-only">이메일 주소</label>
              <input
                id="email-address-login"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="이메일 주소"
              />
            </div>
            <div>
              <label htmlFor="password-login" className="sr-only">비밀번호</label>
              <input
                id="password-login"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호"
              />
            </div>
          </div>

          {/* <div className="flex items-center justify-between">
            <div className="text-sm">
              <a href="#" className="font-medium text-primary-600 hover:text-primary-500">
                비밀번호를 잊으셨나요?
              </a>
            </div>
          </div> */}

          <div>
            <button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-400"
            >
              {isLoading ? <Spinner size="sm" color="text-white" /> : '이메일로 로그인'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">또는</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading || isGoogleLoading}
              type="button"
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-200"
            >
              {isGoogleLoading ? <Spinner size="sm" /> : (
                <>
                  <svg className="w-5 h-5 mr-2" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zM8.282 14.065A5.973 5.973 0 014.187 10a5.973 5.973 0 013.936-5.654l.17-.046c.369-.1.767-.015 1.059.229.291.244.434.62.396 1.001l-.06.591a4.004 4.004 0 001.21 2.778c.484.554.73 1.24.73 1.937 0 .69-.247 1.374-.73 1.937a4.004 4.004 0 00-1.21 2.778l.06.59c.038.382-.105.758-.396 1.002-.292.244-.69.33-1.06.23l-.17-.047zM12.211 14.6A4.981 4.981 0 0015.813 10a4.981 4.981 0 00-3.602-4.6l-.097.026c-.465.124-.78.576-.78.975v7.198c0 .399.315.85.78.974l.097.027z" clipRule="evenodd" />
                  </svg>
                  Google 계정으로 로그인
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
