# 자재시세판 — 건축자재 실시간 거래금액 검색 웹사이트

조달청 나라장터 **가격정보현황서비스** OpenAPI를 이용해 건축자재 가격을 검색하는 웹앱입니다.
정부 API는 브라우저에서 직접 호출 시 CORS 오류가 발생하므로, 이 프로젝트는 작은 Node.js
백엔드(server.js)가 API를 대신 호출해 프론트엔드(public/)에 데이터를 전달하는 구조입니다.

## 1. 실행 방법

```bash
npm install
npm start
```

브라우저에서 **http://localhost:3000** 접속하면 바로 사용할 수 있습니다.
`.env` 파일에 이미 발급받으신 인증키가 입력되어 있습니다.

## 2. 폴더 구조

```
material-price-app/
├── server.js          # Express 백엔드 (API 프록시)
├── .env                # 인증키 및 포트 설정 (git에 올리지 마세요)
├── package.json
└── public/
    ├── index.html      # 검색 화면
    ├── style.css        # 디자인
    └── app.js          # 검색/페이지네이션 로직
```

## 3. 오퍼레이션(operation) 매핑 — 실제 호출 테스트로 검증 완료

조달청 참고문서에 나온 5개 오퍼레이션을 실제로 하나씩 호출해본 결과, 4개는 정상 동작했고
**"종합(Total)"은 문서에는 있지만 실제 서버에는 배포되어 있지 않아(404) 목록에서 제외**했습니다.

| 분류 | 오퍼레이션명 | 상태 |
|---|---|---|
| 토목 | `getPriceInfoListFcltyCmmnMtrilEngrk` | ✅ 정상 |
| 건축 | `getPriceInfoListFcltyCmmnMtrilBildng` | ✅ 정상 |
| 기계설비 | `getPriceInfoListFcltyCmmnMtrilMchnEqp` | ✅ 정상 |
| 전기·정보통신 | `getPriceInfoListFcltyCmmnMtrilElctyIrmc` | ✅ 정상 |
| 종합(전체) | `getPriceInfoListFcltyCmmnMtrilTotal` | ❌ 404 (미사용) |

인증키 파라미터명은 문서 기준 `ServiceKey`(대문자 S)입니다.

## 4. 인증키 관련 참고사항

- 포털에는 **Encoding 키**와 **Decoding(일반) 키** 두 가지가 있습니다. `.env`에는 화면에 보이신
  "일반 인증키"를 넣어두었습니다. 만약 요청 시 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 같은
  인증 오류가 나면, 마이페이지에서 **Encoding 키**를 대신 넣어보세요.
- 개발계정은 트래픽 한도가 있습니다(문서 상 100,000건/일). 초과 시 운영계정 전환이 필요합니다.
- API가 실시간으로 표기되어 있지만, 실제로는 하루 1회(D-1 기준) 갱신되는 자료라는 점을
  포털 설명에서 확인했습니다. 화면 문구도 이를 반영해 "참고가격"으로 안내하고 있습니다.

## 5. 배포하기 (GitHub + Render)

`.env` 파일은 인증키가 들어있어서 **절대 GitHub에 올리면 안 됩니다.** 대신 Render의
환경변수 설정 화면에 키를 직접 입력합니다. (이 프로젝트는 이미 `.gitignore`에 `.env`가
빠지도록 설정되어 있습니다.)

### 1) GitHub에 코드 올리기
1. github.com 접속 → 우측 상단 **+ → New repository** → 이름 입력(예: `material-price-app`) → **Create repository**
2. 방금 만든 저장소 페이지에서 **uploading an existing file** 클릭
3. 이 폴더 안의 파일들을 전부 드래그해서 올리기
   - ⚠️ **`.env` 파일은 올리지 마세요.** (`.env.example`만 올리면 됩니다)
   - `node_modules` 폴더가 있다면 그것도 올리지 마세요 (용량만 커짐, 자동 설치됨)
4. 하단 **Commit changes** 클릭

### 2) Render로 배포하기
1. render.com 가입 (GitHub 계정으로 로그인 가능)
2. 대시보드에서 **New + → Web Service**
3. 방금 올린 GitHub 저장소 선택 → **Connect**
4. 설정값 입력:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. **Environment Variables** 항목에 추가:
   - Key: `DATA_GO_KR_SERVICE_KEY`
   - Value: (공공데이터포털에서 발급받은 실제 인증키)
6. **Create Web Service** 클릭 → 3~5분 정도 빌드 대기
7. 완료되면 `https://프로젝트이름.onrender.com` 형태의 주소가 생성됨 → 폰 브라우저에서 바로 접속 가능

무료 요금제는 일정 시간 미사용 시 서버가 잠들었다가, 다시 접속하면 30초~1분 정도
깨어나는 시간이 걸릴 수 있습니다. 정상적인 동작이니 참고해주세요.
