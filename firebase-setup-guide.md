# Firebase 보안 규칙 적용 가이드

## 1. Firestore 보안 규칙 적용

### 현재 적용된 규칙 (`firestore.rules`)
- 기본적인 보안 규칙이 적용되어 있음
- 사용자별 데이터 격리 및 기본 필드 검증

### 개선된 규칙 (`firestore-improved.rules`)
- 더 엄격한 데이터 검증
- 헬퍼 함수로 코드 재사용성 향상
- 파일 크기 및 형식 제한 강화
- 필드별 세밀한 검증 로직

**적용 방법:**
```bash
firebase deploy --only firestore:rules
```

**주요 개선 사항:**
- 문자열 길이 제한 (제목 200자, 내용 50,000자 등)
- URL 형식 검증 (https:// 필수)
- 타임스탬프 검증 강화
- 업데이트 시 핵심 필드 변경 방지

## 2. Storage 보안 규칙 적용

### 현재 적용된 규칙 (`storage.rules`)
- 기본적인 사용자별 접근 제어
- 파일 크기 제한 (임시로 모든 접근 허용)

### 개선된 규칙 (`storage-improved.rules`)
- 이미지 파일 형식 엄격 검증
- 용도별 다른 파일 크기 제한
- 디버깅용 와일드카드 규칙 제거

**적용 방법:**
```bash
firebase deploy --only storage
```

**파일 크기 제한:**
- 사진 분석: 10MB
- 위험성 평가: 15MB (복수 이미지)
- 게시판 이미지: 5MB
- 프로필 이미지: 2MB

## 3. Firebase Console 추가 설정

### Authentication 설정
1. **Sign-in methods**
   - Google 제공업체만 활성화
   - 승인된 도메인에 운영 도메인 추가
   ```
   - localhost:5173 (개발용)
   - your-domain.com (운영용)
   ```

2. **User actions**
   - ✅ Enable create (계정 생성 허용)
   - ✅ Enable delete (계정 삭제 허용)
   - ✅ Account enumeration protection (계정 열거 보호)

3. **Quotas and limits**
   - 일일 가입 제한: 1000명
   - IP별 요청 제한: 100/시간
   - 로그인 시도 제한: 5회/시간

### Firestore 인덱스 설정
필요한 복합 인덱스들:
```javascript
// boardPosts
{
  "collectionGroup": "boardPosts",
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "category", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "DESCENDING"}
  ]
}

// photoAnalyses
{
  "collectionGroup": "photoAnalyses", 
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "userId", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "DESCENDING"}
  ]
}

// riskAssessments
{
  "collectionGroup": "riskAssessments",
  "queryScope": "COLLECTION", 
  "fields": [
    {"fieldPath": "userId", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "DESCENDING"}
  ]
}
```

### Storage CORS 설정
`cors.json` 파일 내용:
```json
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

적용 명령어:
```bash
gsutil cors set cors.json gs://safety-management-platform.firebasestorage.app
```

## 4. 규칙 배포 순서

### 1단계: 현재 규칙 백업
```bash
# 현재 규칙 다운로드
firebase firestore:indexes > current-indexes.json
firebase functions:config:get > current-config.json
```

### 2단계: 개선된 규칙 적용
```bash
# Firestore 규칙 적용
cp firestore-improved.rules firestore.rules
firebase deploy --only firestore:rules

# Storage 규칙 적용  
cp storage-improved.rules storage.rules
firebase deploy --only storage

# 인덱스 적용
firebase deploy --only firestore:indexes
```

### 3단계: 테스트 및 검증
```bash
# 로컬 에뮬레이터에서 테스트
firebase emulators:start --only firestore,storage
```

## 5. 보안 모니터링 설정

### Cloud Logging 설정
1. **Firestore 로그 모니터링**
   - 권한 거부 이벤트
   - 대량 데이터 접근 시도
   - 비정상적인 쿼리 패턴

2. **Storage 로그 모니터링**
   - 대용량 파일 업로드 시도
   - 권한 없는 접근 시도
   - 파일 형식 위반

### 알림 설정
```yaml
# Cloud Monitoring 알림 정책
- name: "Firestore 보안 위반"
  condition: "resource.type=gce_instance AND log_name=firestore"
  threshold: 10 events / 5 minutes

- name: "Storage 권한 거부"  
  condition: "resource.type=gcs_bucket AND log_name=storage"
  threshold: 20 events / 10 minutes
```

## 6. 운영 체크리스트

### 배포 전 확인사항
- [ ] 테스트 계정 정리
- [ ] 승인된 도메인 확인
- [ ] API 키 환경변수 분리
- [ ] 디버깅용 규칙 제거
- [ ] 로그 모니터링 설정

### 배포 후 모니터링
- [ ] 사용자 로그인/가입 정상 동작
- [ ] 파일 업로드/다운로드 정상 동작
- [ ] 데이터 CRUD 작업 정상 동작
- [ ] 보안 로그 정상 수집
- [ ] 성능 지표 모니터링

## 7. 비상 계획

### 문제 발생 시 대응
1. **기존 규칙으로 롤백**
   ```bash
   # 백업된 규칙 복원
   cp firestore.rules.backup firestore.rules
   firebase deploy --only firestore:rules
   ```

2. **임시 규칙 적용**
   ```bash
   # 모든 인증된 사용자 허용 (긴급시만)
   cp storage-emergency.rules storage.rules
   firebase deploy --only storage
   ```

3. **로그 확인 및 디버깅**
   ```bash
   # Firebase 로그 실시간 모니터링
   firebase functions:log --follow
   ```

## 8. 추가 보안 조치

### 클라이언트 측 보안
- 민감한 API 키 환경변수 분리
- CSP(Content Security Policy) 헤더 설정
- XSS 방지를 위한 입력값 검증
- HTTPS 강제 사용

### 서버 측 보안
- Firebase Admin SDK 서버 인증
- 정기적인 보안 패치 업데이트
- 의존성 취약점 스캔
- 백업 및 재해 복구 계획 