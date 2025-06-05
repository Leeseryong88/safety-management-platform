import { initializeApp } from "@firebase/app";
import type { FirebaseApp } from "@firebase/app";
import { getAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import type { FirebaseStorage } from "firebase/storage";
import { getAnalytics } from "@firebase/analytics";
import type { Analytics } from "@firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCEig8CZ9gggSOMyjS5hn7Ch2ygKzzpfNs",
  authDomain: "safety-management-platform.firebaseapp.com",
  projectId: "safety-management-platform",
  storageBucket: "safety-management-platform.firebasestorage.app",
  messagingSenderId: "101021063059",
  appId: "1:101021063059:web:54337f54f58219029bba66",
  measurementId: "G-1HPX580TGD"
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let analytics: Analytics;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Storage 초기화 개선 (CORS 문제 해결)
  try {
    storage = getStorage(app);
    console.log("Firebase Storage initialized successfully.");
  } catch (storageError) {
    console.warn("Firebase Storage initialization failed, trying alternative method:", storageError);
    // 대체 방법으로 Storage 초기화
    storage = getStorage(app, "gs://safety-management-platform.firebasestorage.app");
  }
  
  // Initialize Analytics only if it's supported by the browser
  // For example, 'isSupported()' can be used if available, or just try-catch
  try {
    analytics = getAnalytics(app);
    console.log("Firebase initialized successfully with Analytics.");
  } catch (analyticsError) {
    console.warn("Firebase Analytics could not be initialized:", analyticsError);
    analytics = null as any; // Or handle as per your app's needs if analytics is optional
  }
} catch (error) {
  console.error("Error initializing Firebase core services:", error);
  // Assign null or a specific error type/value that fits your error handling strategy
  app = null as any; // Or handle more gracefully
  auth = null as any;
  db = null as any;
  storage = null as any;
  analytics = null as any;
  
  // Alert only if the default placeholder API key is still present
  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    alert("Firebase is not configured. Please update lib/firebase.ts with your project credentials.");
  } else {
    // If custom config fails, it's a real issue
    alert(`Failed to initialize Firebase with the provided configuration. Please check the console for errors. Error: ${error}`);
  }
}

export { app, auth, db, storage, analytics };