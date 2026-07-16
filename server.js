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
// 조달청 공식 참고문서(OpenAPI참고자료_나라장터_가격정보현황서비스_1.1)에서 확인한 정확한 값입니다.
const OPERATIONS = {
  civil: 'getPriceInfoListFcltyCmmnMtrilEngrk',        // 시설공통자재(토목) 가격정보
  construction: 'getPriceInfoListFcltyCmmnMtrilBildng', // 시설공통자재(건축) 가격정보
  mechanical: 'getPriceInfoListFcltyCmmnMtrilMchnEqp',  // 시설공통자재(기계설비) 가격정보
  electric: 'getPriceInfoListFcltyCmmnMtrilElctyIrmc',  // 시설공통자재(전기,정보통신) 가격정보
  total: 'getPriceInfoListFcltyCmmnMtrilTotal',         // 시설공통자재(종합) 가격정보
};

/**
 * 자재 가격 검색 API
 * GET /api/materials?keyword=철근&category=electric&pageNo=1&numOfRows=20
 */
app.get('/api/materials', async (req, res) => {
  const { keyword = '', category = 'electric', pageNo = 1, numOfRows = 20 } = req.query;

  const operation = OPERATIONS[category] || OPERATIONS.electric;

  if (!SERVICE_KEY) {
    return res.status(500).json({
      error: 'SERVICE_KEY_MISSING',
      message: '.env 파일에 DATA_GO_KR_SERVICE_KEY를 설정해주세요.',
    });
  }

  try {
    const response = await axios.get(`${BASE_URL}/${operation}`, {
      params: {
        ServiceKey: SERVICE_KEY,
        pageNo,
        numOfRows,
        type: 'json',
        // 검색어가 있으면 한글 규격명(krnPrdctNm) 파라미터로 전달
        ...(keyword ? { krnPrdctNm: keyword } : {}),
      },
      timeout: 10000,
    });

    const data = response.data;

    // API가 XML로 응답하거나 에러코드를 담아 200으로 응답하는 경우를 대비한 방어 코드
    const header = data?.response?.header || data?.header;
    if (header && header.resultCode && header.resultCode !== '00') {
      return res.status(502).json({
        error: 'UPSTREAM_ERROR',
        message: header.resultMsg || '조달청 API 오류',
        raw: data,
      });
    }

    const items =
      data?.response?.body?.items?.item ||
      data?.body?.items?.item ||
      [];

    const totalCount =
      data?.response?.body?.totalCount ?? data?.body?.totalCount ?? 0;

    res.json({
      items: Array.isArray(items) ? items : [items].filter(Boolean),
      totalCount,
      pageNo: Number(pageNo),
      numOfRows: Number(numOfRows),
    });
  } catch (err) {
    console.error('API 호출 오류:', err.response?.data || err.message);
    res.status(500).json({
      error: 'REQUEST_FAILED',
      message: err.message,
      detail: err.response?.data,
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: Boolean(SERVICE_KEY) });
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
