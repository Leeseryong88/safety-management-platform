# Firestore 인덱스 생성 가이드

## 🚨 현재 필요한 인덱스

### 자동 생성 (권장)
1. 에러 메시지에 표시된 링크 클릭:
```
https://console.firebase.google.com/v1/r/project/safety-management-platform/firestore/indexes?create_composite=CmBwcm9qZWN0cy9zYWZldHktbWFuYWdlbWVudC1wbGF0Zm9ybRIkKAIQAhoGdXNlcklkIAEaC2NyZWF0ZWRBdCAC
```

### 수동 생성
Firebase Console → Firestore → 인덱스 → 복합 인덱스 추가

#### 1. photoAnalyses 컬렉션 인덱스
- **컬렉션 ID**: `photoAnalyses`
- **필드**:
  - `userId` (오름차순)
  - `createdAt` (내림차순)

#### 2. riskAssessments 컬렉션 인덱스
- **컬렉션 ID**: `riskAssessments`  
- **필드**:
  - `userId` (오름차순)
  - `createdAt` (내림차순)

#### 3. boardPosts 컬렉션 인덱스
- **컬렉션 ID**: `boardPosts`
- **필드**:
  - `category` (오름차순)
  - `createdAt` (내림차순)

## 🔧 즉시 해결 방법

### 옵션 1: 자동 인덱스 생성 (권장)
1. 화면에 표시된 링크 클릭
2. "인덱스 만들기" 버튼 클릭
3. 몇 분 기다린 후 새로고침

### 옵션 2: 임시 해결 (개발용)
Firebase Console → Firestore → Rules에 다음 규칙 적용:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

⚠️ **주의**: 위 규칙은 임시용이며, 운영 시에는 보안이 취약합니다.

### 옵션 3: 쿼리 단순화
코드에서 복합 쿼리 대신 단순 쿼리 사용:

```typescript
// 기존 (인덱스 필요)
const q = query(
  collection(db, "photoAnalyses"),
  where("userId", "==", currentUser.uid),
  orderBy("createdAt", "desc")
);

// 대체 (인덱스 불필요)
const q = query(
  collection(db, "photoAnalyses"),
  where("userId", "==", currentUser.uid)
);
```

## 📋 인덱스 생성 체크리스트
- [ ] photoAnalyses 인덱스 생성
- [ ] riskAssessments 인덱스 생성  
- [ ] boardPosts 인덱스 생성
- [ ] 인덱스 상태 "빌드 완료" 확인
- [ ] 앱에서 정상 작동 확인

## 🕐 예상 소요 시간
- 자동 생성: 3-10분
- 수동 생성: 5-15분 (데이터 양에 따라)

## 🔍 문제 해결
인덱스가 생성되지 않는 경우:
1. Firebase 프로젝트 권한 확인
2. Firestore 활성화 여부 확인
3. 쿼리 필드명 정확성 확인
4. 브라우저 캐시 클리어 후 재시도 