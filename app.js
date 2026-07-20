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
  hintText: document.getElementById('hintText'),
  suggestPanel: document.getElementById('suggestPanel'),
  suggestCount: document.getElementById('suggestCount'),
  suggestList: document.getElementById('suggestList'),
};

// 카테고리별로 불러온 전체 품명 목록 캐시 (자동완성용)
const nameCache = {}; // { [category]: string[] }
let activeSuggestIndex = -1;

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

// ---------- 품명 자동완성 목록 ----------
// 실제 조달청 데이터에 존재하는 품명만 자동완성으로 보여줘서,
// 존재하지 않는 이름을 검색해 "결과 없음"이 뜨는 상황을 줄여줍니다.
async function loadNameList(category) {
  if (nameCache[category]) return nameCache[category];

  els.hintText.textContent = '품명 목록을 불러오는 중입니다… (최초 1회는 다소 걸릴 수 있어요)';
  try {
    const res = await fetch(`/api/materials/names?category=${encodeURIComponent(category)}`);
    const data = await res.json();
    if (!res.ok) {
      els.hintText.textContent = `품명 목록을 불러오지 못했습니다: ${data.message || '알 수 없는 오류'}`;
      return [];
    }
    nameCache[category] = data.names || [];
    els.hintText.textContent = `Tip. 이 분류에 등록된 품명 ${(data.count || 0).toLocaleString('ko-KR')}개 중에서 자동완성으로 골라보세요.`;
    return nameCache[category];
  } catch (err) {
    els.hintText.textContent = `품명 목록을 불러오지 못했습니다: ${err.message}`;
    return [];
  }
}

const CATEGORY_LABELS = {
  construction: '건축',
  civil: '토목',
  mechanical: '기계설비',
  electric: '전기·통신',
};

function highlightMatch(name, query) {
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(name);
  const before = escapeHtml(name.slice(0, idx));
  const match = escapeHtml(name.slice(idx, idx + query.length));
  const after = escapeHtml(name.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function renderSuggestions(matched, query, category) {
  activeSuggestIndex = -1;
  const label = CATEGORY_LABELS[category] || category;

  if (!matched.length) {
    els.suggestCount.textContent = `검색 결과 0건 (${label})`;
    els.suggestList.innerHTML = `<li class="suggest-empty">"${escapeHtml(query)}"와(과) 일치하는 품명이 없습니다.</li>`;
    els.suggestPanel.hidden = false;
    return;
  }

  els.suggestCount.textContent = `검색 결과 ${matched.length.toLocaleString('ko-KR')}건 (${label})`;
  els.suggestList.innerHTML = matched
    .slice(0, 30)
    .map(({ name, count }) => `
      <li class="suggest-item" role="option" data-name="${escapeHtml(name)}">
        <span class="suggest-avatar">${escapeHtml(name.charAt(0))}</span>
        <span class="suggest-main">
          <span class="suggest-name">${highlightMatch(name, query)}</span>
          <span class="suggest-sub">${count.toLocaleString('ko-KR')}건 등록</span>
        </span>
        <span class="suggest-badge">${label}</span>
      </li>
    `)
    .join('');
  els.suggestPanel.hidden = false;
}

function hideSuggestions() {
  els.suggestPanel.hidden = true;
  els.suggestList.innerHTML = '';
  activeSuggestIndex = -1;
}

async function onKeywordInput() {
  const query = els.keyword.value.trim();
  if (!query) {
    hideSuggestions();
    return;
  }
  const category = els.category.value;
  const names = await loadNameList(category);
  const needle = query.toLowerCase();
  const matched = names.filter(({ name }) => name.toLowerCase().includes(needle));
  renderSuggestions(matched, query, category);
}

function selectSuggestion(name) {
  els.keyword.value = name;
  hideSuggestions();
  state.keyword = name;
  state.category = els.category.value;
  state.pageNo = 1;
  runSearch();
}

els.keyword.addEventListener('input', onKeywordInput);
els.keyword.addEventListener('focus', () => {
  if (els.keyword.value.trim()) onKeywordInput();
});

els.suggestList.addEventListener('mousedown', (e) => {
  const li = e.target.closest('.suggest-item');
  if (!li || !li.dataset.name) return;
  selectSuggestion(li.dataset.name);
});

els.keyword.addEventListener('keydown', (e) => {
  const items = Array.from(els.suggestList.querySelectorAll('.suggest-item[data-name]'));
  if (els.suggestPanel.hidden || !items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSuggestIndex = Math.min(activeSuggestIndex + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggestIndex = Math.max(activeSuggestIndex - 1, 0);
  } else if (e.key === 'Enter' && activeSuggestIndex >= 0) {
    e.preventDefault();
    selectSuggestion(items[activeSuggestIndex].dataset.name);
    return;
  } else if (e.key === 'Escape') {
    hideSuggestions();
    return;
  } else {
    return;
  }

  items.forEach((item, idx) => item.classList.toggle('active', idx === activeSuggestIndex));
  items[activeSuggestIndex]?.scrollIntoView({ block: 'nearest' });
});

document.addEventListener('click', (e) => {
  if (!els.suggestPanel.contains(e.target) && e.target !== els.keyword) {
    hideSuggestions();
  }
});

els.category.addEventListener('change', () => {
  hideSuggestions();
  els.keyword.value = '';
  loadNameList(els.category.value);
});

loadNameList(els.category.value);

// ---------- 검색 ----------
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  hideSuggestions();
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
