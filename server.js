require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;

app.use(cors());
app.use(express.static('public'));

// 조달청_나라장터 가격정보현황서비스 base URL
const BASE_URL = 'http://apis.data.go.kr/1230000/ao/PriceInfoService';

// 카테고리별 오퍼레이션(operation) 매핑
// 조달청 공식 참고문서 기준 5개 오퍼레이션 중, 실제 서버 테스트 결과
// "종합(Total)"은 문서에는 있으나 실제로 배포되지 않아(404) 제외했습니다.
// 나머지 4개는 전부 실제 호출 테스트로 정상 동작을 확인했습니다.
const OPERATIONS = {
  civil: 'getPriceInfoListFcltyCmmnMtrilEngrk',        // 시설공통자재(토목) 가격정보 — 확인됨
  construction: 'getPriceInfoListFcltyCmmnMtrilBildng', // 시설공통자재(건축) 가격정보 — 확인됨
  mechanical: 'getPriceInfoListFcltyCmmnMtrilMchnEqp',  // 시설공통자재(기계설비) 가격정보 — 확인됨
  electric: 'getPriceInfoListFcltyCmmnMtrilElctyIrmc',  // 시설공통자재(전기,정보통신) 가격정보 — 확인됨
};

// ---------------------------------------------------------------------------
// 왜 검색이 안 됐는가
// ---------------------------------------------------------------------------
// 기존 코드는 사용자가 입력한 검색어를 krnPrdctNm 파라미터에 담아 조달청 API에
// 그대로 넘겼습니다. 하지만 이 오퍼레이션들은 "목록 조회" 전용 API라
// krnPrdctNm 같은 검색 파라미터를 서버가 인식하지 못하고 무시합니다.
// 즉, 검색어를 입력하든 안 하든 항상 같은(페이지 순서 그대로의) 결과가 내려오기
// 때문에 "검색이 안 되는 것처럼" 보였던 것입니다.
//
// 해결 방법: 조달청 API에서는 (검색어 없이) 카테고리 전체 목록을 받아와서,
// 그 목록을 우리 서버에서 직접 품명/규격/식별번호 기준으로 필터링합니다.
// 매 요청마다 전체 목록을 다시 받아오면 개발계정 트래픽 한도(문서 기준
// 1,000건/일)를 금방 넘기므로, 카테고리별로 일정 시간(6시간) 캐싱해서
// 재사용합니다.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간
const FETCH_ROWS = 1000; // 한 번에 받아올 최대 건수 (전체 목록 캐싱용)
const cache = new Map(); // category -> { items, fetchedAt }

function normalize(v) {
  return (v ?? '').toString().toLowerCase();
}

async function fetchCategoryItems(category) {
  const now = Date.now();
  const cached = cache.get(category);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items;
  }

  const operation = OPERATIONS[category] || OPERATIONS.electric;

  const response = await axios.get(`${BASE_URL}/${operation}`, {
    params: {
      ServiceKey: SERVICE_KEY,
      pageNo: 1,
      numOfRows: FETCH_ROWS,
      type: 'json',
    },
    timeout: 15000,
  });

  const data = response.data;

  // API가 XML로 응답하거나 에러코드를 담아 200으로 응답하는 경우를 대비한 방어 코드
  const header = data?.response?.header || data?.header;
  if (header && header.resultCode && header.resultCode !== '00') {
    const err = new Error(header.resultMsg || '조달청 API 오류');
    err.status = 502;
    err.raw = data;
    throw err;
  }

  const rawItems = data?.response?.body?.items?.item || data?.body?.items?.item || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems].filter(Boolean);

  cache.set(category, { items, fetchedAt: now });
  return items;
}

/**
 * 자재 가격 검색 API
 * GET /api/materials?keyword=철근&category=electric&pageNo=1&numOfRows=20
 */
app.get('/api/materials', async (req, res) => {
  const { keyword = '', category = 'electric', pageNo = 1, numOfRows = 20 } = req.query;

  if (!SERVICE_KEY) {
    return res.status(500).json({
      error: 'SERVICE_KEY_MISSING',
      message: '.env 파일에 DATA_GO_KR_SERVICE_KEY를 설정해주세요.',
    });
  }

  const targetCategory = OPERATIONS[category] ? category : 'electric';

  try {
    let items = await fetchCategoryItems(targetCategory);

    const trimmedKeyword = keyword.trim();
    if (trimmedKeyword) {
      const needle = normalize(trimmedKeyword);
      items = items.filter((item) => {
        const haystack = [
          item.prdctClsfcNoNm, // 품명
          item.krnPrdctNm,     // 규격(한글 규격명)
          item.prdctIdntNo,    // 물품식별번호
          item.prdctClsfcNo,   // 물품분류번호
        ]
          .filter(Boolean)
          .map(normalize)
          .join(' ');
        return haystack.includes(needle);
      });
    }

    const totalCount = items.length;
    const pageNoNum = Math.max(1, Number(pageNo) || 1);
    const numOfRowsNum = Math.max(1, Number(numOfRows) || 20);
    const start = (pageNoNum - 1) * numOfRowsNum;
    const paged = items.slice(start, start + numOfRowsNum);

    res.json({
      items: paged,
      totalCount,
      pageNo: pageNoNum,
      numOfRows: numOfRowsNum,
    });
  } catch (err) {
    console.error('API 호출 오류:', err.raw || err.response?.data || err.message);
    res.status(err.status || 500).json({
      error: err.raw ? 'UPSTREAM_ERROR' : 'REQUEST_FAILED',
      message: err.message,
      detail: err.raw || err.response?.data,
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: Boolean(SERVICE_KEY) });
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
