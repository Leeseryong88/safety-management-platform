# Firebase Storage 업로드 CORS 에러 해결 가이드

## 🚨 현재 에러
```
Access to XMLHttpRequest has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
It does not have HTTP ok status.
```

## 🔧 즉시 해결 단계

### 1단계: Firebase Console에서 Storage Rules 적용
Firebase Console → Storage → Rules 탭에 다음을 붙여넣기:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### 2단계: Authentication 도메인 추가
Firebase Console → Authentication → Settings → 승인된 도메인에 추가:
- `localhost:5173`
- `127.0.0.1:5173`
- `0.0.0.0:5173`

### 3단계: 브라우저 캐시 완전 삭제
1. 개발자 도구 (F12) 열기
2. Network 탭 → "Disable cache" 체크
3. Application 탭 → Storage → Clear storage
4. 페이지 새로고침 (Ctrl+F5)

### 4단계: 코드에서 임시 수정
`lib/firebase.ts` 파일 확인 후, 다음과 같이 storage 초기화:

```typescript
import { getStorage } from "firebase/storage";

// 기존
const storage = getStorage(app);

// 대체 (CORS 문제 해결)
const storage = getStorage(app, "gs://safety-management-platform.firebasestorage.app");
```

### 5단계: 업로드 코드 수정
PhotoAnalysisPage.tsx에서 업로드 방식 변경:

```typescript
// 기존
const storageRef = ref(storage, `photoAnalyses/${currentUser.uid}/${Date.now()}_${file.name}`);

// 대체 1 (경로 단순화)
const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);

// 대체 2 (Base64 업로드)
const uploadString = await fileToBase64(file);
const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
await uploadString(storageRef, uploadString, 'data_url');
```

### 6단계: CORS 설정 적용 (Google Cloud Shell)
```bash
# Google Cloud Console → Cloud Shell에서 실행
gsutil cors set cors-updated.json gs://safety-management-platform.firebasestorage.app
```

## 🚀 빠른 테스트 방법

### 방법 1: 임시 공개 업로드
Storage Rules를 완전 공개로 설정하고 테스트:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // 모든 접근 허용
    }
  }
}
```

### 방법 2: 다른 브라우저로 테스트
- Chrome 시크릿 모드
- Firefox 또는 Edge
- 모바일 브라우저

### 방법 3: 로컬 서버 변경
```bash
# 현재 (5173 포트)
npm run dev

# 대체 (3000 포트)
npm run dev -- --port 3000
```

## 📋 체크리스트
- [ ] Storage Rules 적용
- [ ] Authentication 도메인 추가
- [ ] 브라우저 캐시 삭제
- [ ] 다른 브라우저로 테스트
- [ ] 네트워크 상태 확인
- [ ] Firebase 프로젝트 권한 확인

## 🆘 최후의 해결책
모든 방법이 실패할 경우:

1. **새 Firebase 프로젝트 생성**
2. **Vercel/Netlify에 배포 후 테스트**
3. **Firebase SDK 버전 다운그레이드**

```bash
npm install firebase@9.22.0
```

## 🔍 디버깅 명령어
브라우저 콘솔에서 실행:

```javascript
// Firebase 상태 확인
console.log('Firebase App:', firebase.app());
console.log('Storage:', firebase.storage());
console.log('Auth User:', firebase.auth().currentUser);

// 네트워크 상태 확인
fetch('https://firebasestorage.googleapis.com/v0/b/safety-management-platform.firebasestorage.app/o')
  .then(response => console.log('Storage accessible:', response.ok))
  .catch(error => console.error('Storage error:', error));
``` 