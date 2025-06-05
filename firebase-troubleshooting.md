# Firebase Storage 업로드 오류 해결 가이드

## 🚨 현재 발생한 오류
- **CORS 정책 오류**: `Response to preflight request doesn't pass access control check`
- **네트워크 오류**: `net::ERR_FAILED`

## 🔧 해결 단계

### 1단계: Firebase Console에서 Storage Rules 업데이트
1. Firebase Console → Storage → Rules 탭
2. 위에서 생성한 `storage.rules` 내용을 복사하여 붙여넣기
3. "게시" 버튼 클릭

### 2단계: CORS 설정 적용 (Google Cloud Shell 사용)
```bash
# Google Cloud Shell에서 실행
gsutil cors set cors.json gs://safety-management-platform.firebasestorage.app
```

### 3단계: Firebase 프로젝트 설정 확인
1. **Authentication** 확인:
   - Google 로그인이 활성화되어 있는지 확인
   - 승인된 도메인에 `localhost:5173` 추가

2. **Storage** 확인:
   - 버킷이 생성되어 있는지 확인
   - 버킷 이름: `safety-management-platform.firebasestorage.app`

### 4단계: 코드에서 임시 디버깅
브라우저 개발자 도구에서 확인:
```javascript
// 콘솔에서 Firebase Auth 상태 확인
console.log('Current User:', firebase.auth().currentUser);
console.log('Auth State:', firebase.auth().currentUser?.uid);
```

### 5단계: 대체 해결책 (임시)
만약 위 방법들이 작동하지 않으면, 코드에서 업로드 경로를 변경:

**PhotoAnalysisPage.tsx에서**:
```typescript
// 기존
const storageRef = ref(storage, `photoAnalyses/${currentUser.uid}/${Date.now()}_${file.name}`);

// 대체 (임시)
const storageRef = ref(storage, `temp/${Date.now()}_${file.name}`);
```

## 🚨 긴급 해결책 (개발용)
Storage Rules를 임시로 공개 모드로 설정:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // 임시로 모든 접근 허용
    }
  }
}
```

⚠️ **주의**: 위 설정은 개발용이며, 운영 시에는 반드시 보안 규칙을 적용해야 합니다.

## 📋 체크리스트
- [ ] Storage Rules 업데이트
- [ ] CORS 설정 적용
- [ ] Authentication 설정 확인
- [ ] 브라우저 캐시 클리어
- [ ] Firebase SDK 버전 확인
- [ ] 네트워크 연결 상태 확인

## 🔍 추가 디버깅
1. **브라우저 개발자 도구 Network 탭**에서 실패한 요청 확인
2. **Firebase Console → Storage → Usage** 탭에서 요청 로그 확인
3. **Firebase Console → Authentication → Users** 탭에서 사용자 인증 상태 확인

## 📞 지원 연락처
- Firebase 공식 문서: https://firebase.google.com/docs/storage
- Stack Overflow: firebase + cors 태그로 검색 