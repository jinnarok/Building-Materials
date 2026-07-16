const state = {
  keyword: '',
  category: 'construction',
  pageNo: 1,
  numOfRows: 15,
  totalCount: 0,
};

const els = {
  form: document.getElementById('searchForm'),
  keyword: document.getElementById('keyword'),
  category: document.getElementById('category'),
  stateBox: document.getElementById('stateBox'),
  tableWrap: document.getElementById('tableWrap'),
  tableBody: document.getElementById('tableBody'),
  resultCount: document.getElementById('resultCount'),
  pager: document.getElementById('pager'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  pageLabel: document.getElementById('pageLabel'),
  clock: document.getElementById('clock'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
};

// ---------- 상단 시계 ----------
function tickClock() {
  const now = new Date();
  els.clock.textContent = now.toLocaleTimeString('ko-KR', { hour12: false });
}
tickClock();
setInterval(tickClock, 1000);

// ---------- API 연결 상태 확인 ----------
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok && data.hasKey) {
      els.statusDot.classList.add('ok');
      els.statusText.textContent = 'API 연결됨';
    } else {
      els.statusDot.classList.add('err');
      els.statusText.textContent = '인증키 미설정';
    }
  } catch {
    els.statusDot.classList.add('err');
    els.statusText.textContent = '서버 연결 실패';
  }
}
checkHealth();

// ---------- 검색 ----------
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  state.keyword = els.keyword.value.trim();
  state.category = els.category.value;
  state.pageNo = 1;
  runSearch();
});

els.prevPage.addEventListener('click', () => {
  if (state.pageNo > 1) {
    state.pageNo -= 1;
    runSearch();
  }
});
els.nextPage.addEventListener('click', () => {
  const maxPage = Math.max(1, Math.ceil(state.totalCount / state.numOfRows));
  if (state.pageNo < maxPage) {
    state.pageNo += 1;
    runSearch();
  }
});

function setState(message, isError = false) {
  els.stateBox.hidden = false;
  els.tableWrap.hidden = true;
  els.pager.hidden = true;
  els.stateBox.classList.toggle('err', isError);
  els.stateBox.innerHTML = `<p>${message}</p>`;
}

function formatPrice(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value ?? '-';
  return n.toLocaleString('ko-KR') + '원';
}

async function runSearch() {
  setState('조회 중입니다…');

  const params = new URLSearchParams({
    keyword: state.keyword,
    category: state.category,
    pageNo: state.pageNo,
    numOfRows: state.numOfRows,
  });

  try {
    const res = await fetch(`/api/materials?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      setState(`조회 실패: ${data.message || '알 수 없는 오류'}`, true);
      return;
    }

    state.totalCount = Number(data.totalCount) || 0;
    renderResults(data.items || []);
  } catch (err) {
    setState(`서버에 연결할 수 없습니다: ${err.message}`, true);
  }
}

function renderResults(items) {
  if (!items.length) {
    setState('검색 결과가 없습니다. 다른 품명으로 다시 시도해보세요.');
    els.resultCount.textContent = '0건';
    return;
  }

  els.stateBox.hidden = true;
  els.tableWrap.hidden = false;
  els.pager.hidden = false;

  els.resultCount.textContent = `총 ${state.totalCount.toLocaleString('ko-KR')}건`;

  els.tableBody.innerHTML = items.map((item, idx) => {
    const rowNo = (state.pageNo - 1) * state.numOfRows + idx + 1;
    const name = item.prdctClsfcNoNm || '-';
    const spec = item.krnPrdctNm || '';
    const idNo = item.prdctIdntNo || item.prdctClsfcNo || '-';
    const unit = item.unit || '-';
    const price = item.prce ?? '-';
    const delivery = item.dlvryCndtnNm || '-';
    const date = item.nticeDt || '-';
    const region = item.splyJrsdctRgnNm || '전국';

    return `
      <tr>
        <td class="col-idx">${rowNo}</td>
        <td>
          <span class="name-primary">${escapeHtml(name)}</span>
          ${spec && spec !== name ? `<span class="name-sub">${escapeHtml(spec)}</span>` : ''}
        </td>
        <td class="mono">${escapeHtml(String(idNo))}</td>
        <td class="col-num">${escapeHtml(String(unit))}</td>
        <td class="col-num price-cell">${formatPrice(price)}</td>
        <td>${escapeHtml(String(delivery))}</td>
        <td class="mono">${escapeHtml(String(date))}</td>
        <td>${escapeHtml(String(region))}</td>
      </tr>
    `;
  }).join('');

  const maxPage = Math.max(1, Math.ceil(state.totalCount / state.numOfRows));
  els.pageLabel.textContent = `${state.pageNo} / ${maxPage} 페이지`;
  els.prevPage.disabled = state.pageNo <= 1;
  els.nextPage.disabled = state.pageNo >= maxPage;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
