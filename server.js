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
// 왜 검색이 안 됐는가 (1차 수정 때)
// ---------------------------------------------------------------------------
// 조달청 목록 조회 API는 krnPrdctNm 같은 검색 파라미터를 인식하지 못해서,
// 검색어를 넣든 안 넣든 항상 같은 결과가 내려왔습니다. 그래서 전체 목록을
// 받아온 뒤 서버에서 직접 필터링하는 방식으로 바꿨습니다.
//
// 그런데 1차 수정본은 한 번에 1,000건만 받아왔습니다. 카테고리별 전체
// 데이터가 1,000건보다 많으면("시멘트" 같은 항목이 뒷페이지에 있으면)
// 첫 1,000건 안에 없어서 여전히 "검색 결과 없음"이 떴던 것입니다.
//
// 이번 수정: totalCount를 확인해서 전체 페이지를 끝까지 반복 조회하고,
// 그 전체 목록을 캐싱한 뒤 필터링합니다. (안전장치로 최대 페이지 수 제한)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 (원자료는 연 2회만 갱신됨)
const PAGE_SIZE = 1000;      // 한 번의 호출로 받아올 건수
const MAX_PAGES = 30;        // 안전장치: 카테고리당 최대 30페이지(=최대 30,000건)까지만 수집
const cache = new Map();     // category -> { items, fetchedAt, totalCountFromApi }

function normalize(v) {
  return (v ?? '').toString().toLowerCase();
}

async function fetchOnePage(operation, pageNo) {
  const response = await axios.get(`${BASE_URL}/${operation}`, {
    params: {
      ServiceKey: SERVICE_KEY,
      pageNo,
      numOfRows: PAGE_SIZE,
      type: 'json',
    },
    timeout: 15000,
  });

  const data = response.data;
  const header = data?.response?.header || data?.header;
  if (header && header.resultCode && header.resultCode !== '00') {
    const err = new Error(header.resultMsg || '조달청 API 오류');
    err.status = 502;
    err.raw = data;
    throw err;
  }

  const rawItems = data?.response?.body?.items?.item || data?.body?.items?.item || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems].filter(Boolean);
  const totalCountFromApi = Number(
    data?.response?.body?.totalCount ?? data?.body?.totalCount ?? items.length
  );

  return { items, totalCountFromApi };
}

async function fetchCategoryItems(category) {
  const now = Date.now();
  const cached = cache.get(category);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const operation = OPERATIONS[category] || OPERATIONS.electric;

  // 1페이지를 먼저 받아서 전체 건수를 확인
  const first = await fetchOnePage(operation, 1);
  let items = [...first.items];
  const totalCountFromApi = first.totalCountFromApi;

  let pageNo = 2;
  while (items.length < totalCountFromApi && pageNo <= MAX_PAGES) {
    const next = await fetchOnePage(operation, pageNo);
    if (!next.items.length) break; // 더 이상 데이터가 없으면 중단
    items = items.concat(next.items);
    pageNo += 1;
  }

  console.log(
    `[${category}] 전체 ${totalCountFromApi}건 중 ${items.length}건 수집 완료 (요청 페이지 수: ${pageNo - 1})`
  );

  const result = { items, fetchedAt: now, totalCountFromApi };
  cache.set(category, result);
  return result;
}

function matchesKeyword(item, needle) {
  const haystack = [
    item.prdctClsfcNoNm, // 물품분류번호명 (품명/분류)
    item.krnPrdctNm,     // 한글 품명/규격
    item.prdctIdntNo,    // 물품식별번호
    item.prdctClsfcNo,   // 물품분류번호
  ]
    .filter(Boolean)
    .map(normalize)
    .join(' ');
  return haystack.includes(needle);
}

/**
 * 자재 가격 검색 API
 * GET /api/materials?keyword=철근&category=electric&pageNo=1&numOfRows=20
 * 디버그: GET /api/materials?debug=1&category=construction  → 필터링 없이 원본 데이터 일부와 필드 목록 확인
 */
app.get('/api/materials', async (req, res) => {
  const { keyword = '', category = 'electric', pageNo = 1, numOfRows = 20, debug } = req.query;

  if (!SERVICE_KEY) {
    return res.status(500).json({
      error: 'SERVICE_KEY_MISSING',
      message: '.env 파일에 DATA_GO_KR_SERVICE_KEY를 설정해주세요.',
    });
  }

  const targetCategory = OPERATIONS[category] ? category : 'electric';

  try {
    const { items: allItems, totalCountFromApi } = await fetchCategoryItems(targetCategory);

    // 디버그 모드: 실제 조달청 응답 필드명과 샘플 데이터를 그대로 보여줌
    if (debug === '1') {
      return res.json({
        category: targetCategory,
        totalCountFromApi,
        collectedCount: allItems.length,
        sampleFields: allItems[0] ? Object.keys(allItems[0]) : [],
        sample: allItems.slice(0, 3),
      });
    }

    let items = allItems;
    const trimmedKeyword = keyword.trim();
    if (trimmedKeyword) {
      const needle = normalize(trimmedKeyword);
      items = items.filter((item) => matchesKeyword(item, needle));
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
