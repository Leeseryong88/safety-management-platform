import React, { useState, useEffect, Fragment, createContext, useContext } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { User, onAuthStateChanged, signOut as firebaseSignOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { UserProfile } from '../types';
import { HomeIcon, CameraIcon, ClipboardListIcon, ChatBubbleLeftRightIcon, UserCircleIcon, Cog6ToothIcon, DocumentTextIcon } from './Icons';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import Spinner from './Spinner';

// Auth Context
interface AuthContextType {
  currentUser: UserProfile | null;
  loadingAuth: boolean;
  signInWithGoogle: () => Promise<void>; 
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userAuth) => {
      if (userAuth) {
        const userRef = doc(db, "users", userAuth.uid);
        const docSnap = await getDoc(userRef);

        let userProfileData: UserProfile;

        if (docSnap.exists()) {
          userProfileData = docSnap.data() as UserProfile;
          try {
            await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
          } catch (updateError: any) {
            console.error("Error updating lastLoginAt:", updateError);
            if (updateError.code === 'unavailable') {
              console.warn("Firestore unavailable: Could not update last login time. Check network connection.");
            }
          }
        } else {
          userProfileData = {
            uid: userAuth.uid,
            email: userAuth.email,
            displayName: userAuth.displayName,
            photoURL: userAuth.photoURL,
          };
          try {
            await setDoc(userRef, {
              ...userProfileData,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });
          } catch (error: any) {
            console.error("Error creating user profile in Firestore:", error);
             if (error.code === 'unavailable') {
                console.error("Firestore unavailable: User profile could not be created. Check network connection. User will be signed out.");
                alert("사용자 프로필을 생성하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요. 로그아웃됩니다.");
            }
            // Critical error, sign out user
            await firebaseSignOut(auth); 
            setCurrentUser(null);
            setLoadingAuth(false);
            navigate('/login'); // Redirect to login if profile creation fails critically
            return;
          }
        }
        setCurrentUser(userProfileData);
      } else {
        setCurrentUser(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const signInWithGoogle = async () => {
    setLoadingAuth(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle setting currentUser and navigation
    } catch (error: any) {
      console.error("Error during Google sign-in:", error);
      // Let onAuthStateChanged handle loadingAuth false if sign-in fails and user is not set
      // Or set it here explicitly if needed after ensuring currentUser is not set
      if (!auth.currentUser) {
        setLoadingAuth(false); 
      }
      throw error; // Re-throw to be caught by the caller in LoginPage
    }
  };
  
  const signOutUser = async () => {
    setLoadingAuth(true);
    try {
      await firebaseSignOut(auth);
      setCurrentUser(null); // Ensure local state is cleared immediately
      navigate('/login'); 
    } catch (error: any) { 
      console.error("Error signing out: ", error);
      if (error.code === 'unavailable') {
         console.warn("Sign out failed: Firestore may be unavailable to complete all sign-out related operations. Check network connection.");
      }
      // Still navigate and clear user even if some backend ops fail
      setCurrentUser(null);
      navigate('/login');
    } finally {
      setLoadingAuth(false);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loadingAuth, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const Logo = () => (
  <span className="text-2xl font-bold text-white flex items-center">
    <Cog6ToothIcon className="h-8 w-8 mr-2 text-primary-300" />
    AI-<span className="text-primary-300">RISKA</span>
  </span>
);

const navItems = [
  { name: '홈', path: '/', icon: HomeIcon, requiresAuth: false },
  { name: '사진 위험 분석', path: '/photo-analysis', icon: CameraIcon, requiresAuth: false },
  { name: 'AI 위험성 평가', path: '/risk-assessment', icon: ClipboardListIcon, requiresAuth: true },
  { name: 'AI 안전 챗봇', path: '/ai-qa', icon: ChatBubbleLeftRightIcon, requiresAuth: true },
  { name: '게시판', path: '/board', icon: DocumentTextIcon, requiresAuth: false },
];

const SidebarNav: React.FC = () => {
  const { currentUser, loadingAuth } = useAuth();
  const location = useLocation();

  if (loadingAuth) {
    return <div className="p-4"><Spinner size="sm" text="메뉴 로딩중..." /></div>;
  }

  return (
    <nav className="mt-8 flex-1">
      <ul role="list" className="space-y-1">
        {navItems.map((item) => {
          if (item.requiresAuth && !currentUser) {
            return null; 
          }
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <li key={item.name}>
              <NavLink
                to={item.path}
                className={
                  `group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ease-in-out ${
                    isActive
                      ? 'bg-primary-700 text-white shadow-md'
                      : 'text-primary-100 hover:bg-primary-600 hover:text-white'
                  }`
                }
              >
                <item.icon
                  className="mr-3 flex-shrink-0 h-5 w-5"
                  aria-hidden="true"
                />
                {item.name}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

const Layout: React.FC = () => {
  const { currentUser, loadingAuth, signOutUser } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOutUser();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={`bg-primary-800 text-white w-64 flex-shrink-0 flex flex-col fixed inset-y-0 left-0 z-30 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-200 ease-in-out md:flex`}>
        <div className="flex items-center justify-between h-20 px-4 border-b border-primary-700">
          <Link to="/" className="flex items-center" aria-label="홈으로 이동">
            <Logo />
          </Link>
          <button 
            onClick={() => setIsMobileMenuOpen(false)} 
            className="md:hidden text-primary-200 hover:text-white"
            aria-label="모바일 메뉴 닫기"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="flex-grow overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="p-4 border-t border-primary-700">
          <p className="text-xs text-primary-300">&copy; {new Date().getFullYear()} AI-RISKA</p>
           <div className="mt-2 text-xs">
            <Link to="/terms" className="text-primary-300 hover:text-white mr-2">이용약관</Link>
            <Link to="/privacy" className="text-primary-300 hover:text-white">개인정보처리방침</Link>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm h-20 flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 z-20 w-full">
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            className="md:hidden text-gray-500 hover:text-gray-700"
            aria-label="모바일 메뉴 열기"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu-sidebar"
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <div className="flex-1 min-w-0 md:ml-0 ml-3">
            {/* Placeholder for breadcrumbs or page title if needed */}
          </div>
          <div className="flex items-center">
            {loadingAuth ? (
              <Spinner size="sm" />
            ) : currentUser ? (
              <div className="relative group">
                <button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500" aria-haspopup="true" aria-expanded="false">
                  <span className="sr-only">사용자 메뉴 열기</span>
                  {currentUser.photoURL ? (
                    <img className="h-8 w-8 rounded-full object-cover" src={currentUser.photoURL} alt={currentUser.displayName || '사용자 프로필 사진'} />
                  ) : (
                    <UserCircleIcon className="h-8 w-8 text-gray-400" aria-hidden="true" />
                  )}
                  <span className="hidden md:inline-block ml-2 text-gray-700">{currentUser.displayName || currentUser.email}</span>
                </button>
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 opacity-0 group-hover:opacity-100 focus:outline-none transition-opacity duration-150 ease-in-out transform scale-95 group-hover:scale-100 z-40" role="menu" aria-orientation="vertical" aria-labelledby="user-menu-button" tabIndex={-1}>
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    role="menuitem" tabIndex={-1}
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-x-2">
                <Link
                  to="/login"
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  로그인
                </Link>
                <Link
                  to="/signup"
                  className="px-3 py-2 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                >
                  회원가입
                </Link>
              </div>
            )}
          </div>
        </header>
        
        {isMobileMenuOpen && (
            <div 
                id="mobile-menu-sidebar"
                className="fixed inset-0 z-20 bg-black bg-opacity-25 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-hidden="true"
            ></div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
