const STORAGE_KEY = 'rakuten-deal-base-v1';
const MAX_ITEMS = 5;
const API_ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';

const state = {
  settings: {
    applicationId: '',
    accessKey: '',
    hitsPerItem: 8,
    defaultShipping: 800,
    pointMode: 'full',
    sortMode: 'effective'
  },
  queries: Array.from({ length: MAX_ITEMS }, (_, i) => ({
    id: i + 1,
    enabled: i === 0,
    keyword: '',
    minPrice: '',
    maxPrice: '',
    excludeShops: ''
  })),
  results: {},
  selected: {},
  lastSummary: null
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  loadState();
  renderQueryRows();
  bindEvents();
  syncSettingsUI();
  renderSummary();
}

function cacheElements() {
  els.queryList = document.getElementById('queryList');
  els.searchBtn = document.getElementById('searchBtn');
  els.clearBtn = document.getElementById('clearBtn');
  els.resultsArea = document.getElementById('resultsArea');
  els.summaryArea = document.getElementById('summaryArea');
  els.optimizeBtn = document.getElementById('optimizeBtn');
  els.openSettingsBtn = document.getElementById('openSettingsBtn');
  els.settingsDialog = document.getElementById('settingsDialog');
  els.saveSettingsBtn = document.getElementById('saveSettingsBtn');
  els.applicationId = document.getElementById('applicationId');
  els.accessKey = document.getElementById('accessKey');
  els.hitsPerItem = document.getElementById('hitsPerItem');
  els.defaultShipping = document.getElementById('defaultShipping');
  els.pointMode = document.getElementById('pointMode');
  els.sortMode = document.getElementById('sortMode');
  els.saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
}

function bindEvents() {
  els.searchBtn.addEventListener('click', searchAll);
  els.clearBtn.addEventListener('click', clearAll);
  els.optimizeBtn.addEventListener('click', optimizeBasket);
  els.openSettingsBtn.addEventListener('click', () => els.settingsDialog.showModal());
  els.saveSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    state.settings.applicationId = els.applicationId.value.trim();
    state.settings.accessKey = els.accessKey.value.trim();
    state.settings.hitsPerItem = Number(els.hitsPerItem.value || 8);
    state.settings.defaultShipping = Number(els.defaultShipping.value || 0);
    state.settings.pointMode = els.pointMode.value;
    state.settings.sortMode = els.sortMode.value;
    persistState();
    els.settingsDialog.close();
    renderResults();
    renderSummary();
  });
  els.hitsPerItem.addEventListener('change', quickSaveSettings);
  els.defaultShipping.addEventListener('change', quickSaveSettings);
  els.pointMode.addEventListener('change', () => {
    quickSaveSettings();
    renderResults();
    renderSummary();
  });
  els.sortMode.addEventListener('change', () => {
    quickSaveSettings();
    renderResults();
  });
  els.saveSnapshotBtn.addEventListener('click', () => {
    persistState();
    alert('検索条件を保存しました。');
  });
}

function quickSaveSettings() {
  state.settings.hitsPerItem = Number(els.hitsPerItem.value || 8);
  state.settings.defaultShipping = Number(els.defaultShipping.value || 0);
  state.settings.pointMode = els.pointMode.value;
  state.settings.sortMode = els.sortMode.value;
  persistState();
}

function syncSettingsUI() {
  els.applicationId.value = state.settings.applicationId;
  els.accessKey.value = state.settings.accessKey;
  els.hitsPerItem.value = String(state.settings.hitsPerItem);
  els.defaultShipping.value = String(state.settings.defaultShipping);
  els.pointMode.value = state.settings.pointMode;
  els.sortMode.value = state.settings.sortMode;
}

function renderQueryRows() {
  const template = document.getElementById('queryRowTemplate');
  els.queryList.innerHTML = '';
  state.queries.forEach((query, index) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.query-row');
    row.dataset.id = String(query.id);
    fragment.querySelector('.query-title').textContent = `商品 ${index + 1}`;

    const enableEl = fragment.querySelector('.query-enable');
    const keywordEl = fragment.querySelector('.query-keyword');
    const minEl = fragment.querySelector('.query-min-price');
    const maxEl = fragment.querySelector('.query-max-price');
    const excludeEl = fragment.querySelector('.query-exclude-shops');

    enableEl.checked = query.enabled;
    keywordEl.value = query.keyword;
    minEl.value = query.minPrice;
    maxEl.value = query.maxPrice;
    excludeEl.value = query.excludeShops;

    enableEl.addEventListener('change', () => updateQuery(query.id, 'enabled', enableEl.checked));
    keywordEl.addEventListener('input', () => updateQuery(query.id, 'keyword', keywordEl.value));
    minEl.addEventListener('input', () => updateQuery(query.id, 'minPrice', minEl.value));
    maxEl.addEventListener('input', () => updateQuery(query.id, 'maxPrice', maxEl.value));
    excludeEl.addEventListener('input', () => updateQuery(query.id, 'excludeShops', excludeEl.value));

    els.queryList.appendChild(fragment);
  });
}

function updateQuery(id, key, value) {
  const target = state.queries.find((q) => q.id === id);
  if (!target) return;
  target[key] = value;
  persistState();
}

async function searchAll() {
  if (!state.settings.applicationId || !state.settings.accessKey) {
    alert('先に API設定 で Application ID と Access Key を保存してください。');
    els.settingsDialog.showModal();
    return;
  }
  const activeQueries = state.queries.filter((q) => q.enabled && q.keyword.trim());
  if (!activeQueries.length) {
    alert('少なくとも1件は商品名を入力してください。');
    return;
  }

  els.resultsArea.innerHTML = '<div class="empty-state">検索中です...</div>';
  state.results = {};
  state.selected = {};
  state.lastSummary = null;
  renderSummary();

  try {
    for (const query of activeQueries) {
      const items = await fetchRakutenItems(query);
      const normalized = normalizeItems(items, query);
      state.results[query.id] = sortCandidates(normalized);
      if (state.results[query.id][0]) {
        state.selected[query.id] = state.results[query.id][0].candidateId;
      }
    }
    persistState();
    renderResults();
    renderSummary();
  } catch (error) {
    console.error(error);
    els.resultsArea.innerHTML = `<div class="empty-state">検索に失敗しました。<br>${escapeHtml(error.message || String(error))}</div>`;
  }
}

async function fetchRakutenItems(query) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('applicationId', state.settings.applicationId);
  url.searchParams.set('accessKey', state.settings.accessKey);
  url.searchParams.set('keyword', query.keyword.trim());
  url.searchParams.set('hits', String(state.settings.hitsPerItem));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');
  url.searchParams.set('imageFlag', '1');
  url.searchParams.set('availability', '1');
  url.searchParams.set('sort', '+itemPrice');
  if (query.minPrice) url.searchParams.set('minPrice', String(query.minPrice));
  if (query.maxPrice) url.searchParams.set('maxPrice', String(query.maxPrice));

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`APIエラー: ${response.status} ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (!data.Items || !Array.isArray(data.Items)) {
    throw new Error('想定外のレスポンスです。');
  }
  return data.Items;
}

function normalizeItems(items, query) {
  const excludedTerms = query.excludeShops
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  return items
    .map((item, index) => {
      const shopName = item.shopName || '';
      if (excludedTerms.some((term) => shopName.toLowerCase().includes(term))) return null;
      const itemPrice = Number(item.itemPrice || 0);
      const pointRate = Number(item.pointRate || 1);
      const points = estimatePoints(itemPrice, pointRate);
      const shipping = Number(item.postageFlag) === 0 ? 0 : Number(state.settings.defaultShipping || 0);
      const coupon = 0;
      const effective = calcEffectivePrice({ itemPrice, points, shipping, coupon });
      const imageUrl = getImageUrl(item);
      return {
        candidateId: `${query.id}-${index}-${item.itemCode || item.itemUrl || Math.random().toString(36).slice(2)}`,
        queryId: query.id,
        keyword: query.keyword,
        itemName: item.itemName || '(名称なし)',
        itemPrice,
        pointRate,
        estimatedPoints: points,
        postageFlag: Number(item.postageFlag || 1),
        shipping,
        coupon,
        effectivePrice: effective,
        shopName,
        shopCode: item.shopCode || shopName,
        shopUrl: item.shopUrl || '#',
        itemUrl: item.itemUrl || item.affiliateUrl || item.shopUrl || '#',
        reviewAverage: Number(item.reviewAverage || 0),
        reviewCount: Number(item.reviewCount || 0),
        imageUrl,
        raw: item
      };
    })
    .filter(Boolean);
}

function estimatePoints(price, pointRate) {
  const mode = state.settings.pointMode;
  const basePercent = Number(pointRate || 1);
  const full = Math.floor(price * (basePercent / 100));
  if (mode === 'none') return 0;
  if (mode === 'half') return Math.floor(full / 2);
  return full;
}

function calcEffectivePrice({ itemPrice, points, shipping, coupon }) {
  return Math.max(0, itemPrice - points - coupon + shipping);
}

function sortCandidates(candidates) {
  const sorted = [...candidates];
  sorted.sort((a, b) => {
    switch (state.settings.sortMode) {
      case 'price':
        return a.itemPrice - b.itemPrice || a.effectivePrice - b.effectivePrice;
      case 'point':
        return b.estimatedPoints - a.estimatedPoints || a.effectivePrice - b.effectivePrice;
      default:
        return a.effectivePrice - b.effectivePrice || a.itemPrice - b.itemPrice;
    }
  });
  return sorted;
}

function renderResults() {
  const resultEntries = Object.entries(state.results);
  if (!resultEntries.length) {
    els.resultsArea.className = 'results-area empty-state';
    els.resultsArea.textContent = 'まだ検索していません。';
    return;
  }

  els.resultsArea.className = 'results-area';
  els.resultsArea.innerHTML = '';

  resultEntries
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([queryId, candidates]) => {
      const section = document.createElement('section');
      section.className = 'item-section';
      const query = state.queries.find((q) => q.id === Number(queryId));
      section.innerHTML = `<h3>商品 ${queryId}: ${escapeHtml(query?.keyword || '')}</h3>`;

      if (!candidates.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '候補が見つかりませんでした。';
        section.appendChild(empty);
        els.resultsArea.appendChild(section);
        return;
      }

      const cards = document.createElement('div');
      cards.className = 'cards';
      candidates.forEach((candidate) => cards.appendChild(buildCandidateCard(candidate)));
      section.appendChild(cards);
      els.resultsArea.appendChild(section);
    });
}

function buildCandidateCard(candidate) {
  const card = document.createElement('article');
  card.className = 'card';
  if (state.selected[candidate.queryId] === candidate.candidateId) {
    card.classList.add('selected');
  }

  const safeImage = candidate.imageUrl || 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="12" fill="#64748b">No Image</text></svg>');

  card.innerHTML = `
    <div class="card-top">
      <img src="${safeImage}" alt="${escapeHtml(candidate.itemName)}" referrerpolicy="no-referrer" />
      <div>
        <h4>${escapeHtml(candidate.itemName)}</h4>
        <div class="shop">${escapeHtml(candidate.shopName)}</div>
        <div class="price-line">${formatYen(candidate.itemPrice)}</div>
        <div class="warn-text">実質価格: ${formatYen(candidate.effectivePrice)}</div>
      </div>
    </div>
    <div class="meta-grid">
      <div class="mini"><div class="label">ポイント評価</div><div class="value">-${formatYen(candidate.estimatedPoints)}</div></div>
      <div class="mini"><div class="label">送料補正</div><div class="value">+${formatYen(candidate.shipping)}</div></div>
      <div class="mini"><div class="label">クーポン補正</div><div class="value">-${formatYen(candidate.coupon)}</div></div>
      <div class="mini"><div class="label">ポイント倍率</div><div class="value">${candidate.pointRate}倍</div></div>
    </div>
  `;

  const controls = document.createElement('div');
  controls.className = 'card-controls';

  const shippingLabel = document.createElement('label');
  shippingLabel.innerHTML = `送料補正(円)<input type="number" min="0" step="1" value="${candidate.shipping}" />`;
  shippingLabel.querySelector('input').addEventListener('change', (e) => updateCandidateValue(candidate.queryId, candidate.candidateId, 'shipping', Number(e.target.value || 0)));

  const couponLabel = document.createElement('label');
  couponLabel.innerHTML = `クーポン補正(円)<input type="number" min="0" step="1" value="${candidate.coupon}" />`;
  couponLabel.querySelector('input').addEventListener('change', (e) => updateCandidateValue(candidate.queryId, candidate.candidateId, 'coupon', Number(e.target.value || 0)));

  controls.appendChild(shippingLabel);
  controls.appendChild(couponLabel);
  card.appendChild(controls);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const selectBtn = document.createElement('button');
  selectBtn.textContent = state.selected[candidate.queryId] === candidate.candidateId ? '選択中' : 'この候補を選ぶ';
  selectBtn.addEventListener('click', () => {
    state.selected[candidate.queryId] = candidate.candidateId;
    persistState();
    renderResults();
    renderSummary();
  });
  const openLink = document.createElement('a');
  openLink.href = candidate.itemUrl;
  openLink.target = '_blank';
  openLink.rel = 'noopener noreferrer';
  openLink.textContent = '商品ページへ';

  actions.appendChild(selectBtn);
  actions.appendChild(openLink);
  card.appendChild(actions);
  return card;
}

function updateCandidateValue(queryId, candidateId, key, value) {
  const list = state.results[queryId] || [];
  const target = list.find((c) => c.candidateId === candidateId);
  if (!target) return;
  target[key] = value;
  target.estimatedPoints = estimatePoints(target.itemPrice, target.pointRate);
  target.effectivePrice = calcEffectivePrice({
    itemPrice: target.itemPrice,
    points: target.estimatedPoints,
    shipping: target.shipping,
    coupon: target.coupon
  });
  state.results[queryId] = sortCandidates(list);
  if (!state.selected[queryId] || !list.some((c) => c.candidateId === state.selected[queryId])) {
    state.selected[queryId] = state.results[queryId][0]?.candidateId || null;
  }
  persistState();
  renderResults();
  renderSummary();
}

function renderSummary() {
  const selectedItems = getSelectedCandidates();
  if (!selectedItems.length) {
    els.summaryArea.className = 'summary-area empty-state';
    els.summaryArea.textContent = '商品を検索すると、ここに最安候補と組み合わせ結果を表示します。';
    return;
  }

  const basket = summarizeBasket(selectedItems);
  els.summaryArea.className = 'summary-area';
  els.summaryArea.innerHTML = `
    <div class="summary-card">
      <h3>現在の選択</h3>
      <div class="summary-grid">
        <div class="metric"><div class="metric-label">商品合計</div><div class="metric-value">${formatYen(basket.totalItemPrice)}</div></div>
        <div class="metric"><div class="metric-label">ポイント評価</div><div class="metric-value">-${formatYen(basket.totalPoints)}</div></div>
        <div class="metric"><div class="metric-label">送料補正</div><div class="metric-value">+${formatYen(basket.totalShipping)}</div></div>
        <div class="metric"><div class="metric-label">実質合計</div><div class="metric-value">${formatYen(basket.totalEffective)}</div></div>
      </div>
      <table class="selection-table">
        <thead>
          <tr>
            <th>商品</th>
            <th>ショップ</th>
            <th>価格</th>
            <th>ポイント</th>
            <th>送料</th>
            <th>実質</th>
          </tr>
        </thead>
        <tbody>
          ${selectedItems.map((item) => `
            <tr>
              <td>${escapeHtml(item.keyword)}</td>
              <td>${escapeHtml(item.shopName)}</td>
              <td>${formatYen(item.itemPrice)}</td>
              <td>-${formatYen(item.estimatedPoints)}</td>
              <td>+${formatYen(item.shipping)}</td>
              <td>${formatYen(item.effectivePrice)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${state.lastSummary ? buildOptimizationHtml(state.lastSummary) : ''}
    </div>
  `;
}

function optimizeBasket() {
  const groups = Object.entries(state.results)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, candidates]) => candidates.slice(0, 6));

  if (!groups.length || groups.some((group) => group.length === 0)) {
    alert('まず各商品を検索してください。');
    return;
  }

  let best = null;
  const current = [];

  const walk = (index) => {
    if (index === groups.length) {
      const basket = summarizeBasket(current, { consolidateShippingByShop: true });
      if (!best || basket.totalEffective < best.totalEffective) {
        best = {
          ...basket,
          items: current.map((item) => ({ ...item }))
        };
      }
      return;
    }
    for (const candidate of groups[index]) {
      current.push(candidate);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  state.lastSummary = best;
  persistState();
  renderSummary();
}

function summarizeBasket(items, options = {}) {
  const consolidateShippingByShop = Boolean(options.consolidateShippingByShop);
  let totalItemPrice = 0;
  let totalPoints = 0;
  let totalCoupon = 0;
  let totalShipping = 0;
  const shopShipping = new Map();

  items.forEach((item) => {
    totalItemPrice += item.itemPrice;
    totalPoints += item.estimatedPoints;
    totalCoupon += item.coupon;
    if (consolidateShippingByShop) {
      const prev = shopShipping.get(item.shopCode) ?? null;
      if (prev === null || item.shipping > prev) {
        shopShipping.set(item.shopCode, item.shipping);
      }
    } else {
      totalShipping += item.shipping;
    }
  });

  if (consolidateShippingByShop) {
    totalShipping = Array.from(shopShipping.values()).reduce((sum, v) => sum + v, 0);
  }

  return {
    totalItemPrice,
    totalPoints,
    totalCoupon,
    totalShipping,
    totalEffective: Math.max(0, totalItemPrice - totalPoints - totalCoupon + totalShipping)
  };
}

function buildOptimizationHtml(summary) {
  if (!summary || !summary.items?.length) return '';
  return `
    <div class="note-box" style="margin-top:14px;">
      <strong>最安組み合わせ候補</strong>
      <p>上位候補から総当たりし、同一ショップは送料を1回だけ計上する前提で比較した結果です。</p>
      <div class="summary-grid">
        <div class="metric"><div class="metric-label">最適 実質合計</div><div class="metric-value">${formatYen(summary.totalEffective)}</div></div>
        <div class="metric"><div class="metric-label">商品合計</div><div class="metric-value">${formatYen(summary.totalItemPrice)}</div></div>
        <div class="metric"><div class="metric-label">ポイント評価</div><div class="metric-value">-${formatYen(summary.totalPoints)}</div></div>
        <div class="metric"><div class="metric-label">送料計上</div><div class="metric-value">+${formatYen(summary.totalShipping)}</div></div>
      </div>
      <table class="selection-table">
        <thead><tr><th>商品</th><th>ショップ</th><th>価格</th><th>送料補正</th><th>実質</th></tr></thead>
        <tbody>
          ${summary.items.map((item) => `
            <tr>
              <td>${escapeHtml(item.keyword)}</td>
              <td>${escapeHtml(item.shopName)}</td>
              <td>${formatYen(item.itemPrice)}</td>
              <td>+${formatYen(item.shipping)}</td>
              <td>${formatYen(item.effectivePrice)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getSelectedCandidates() {
  return Object.entries(state.selected)
    .map(([queryId, candidateId]) => {
      const list = state.results[queryId] || [];
      return list.find((candidate) => candidate.candidateId === candidateId);
    })
    .filter(Boolean)
    .sort((a, b) => a.queryId - b.queryId);
}

function getImageUrl(item) {
  if (Array.isArray(item.mediumImageUrls) && item.mediumImageUrls.length) {
    const first = item.mediumImageUrls[0];
    if (typeof first === 'string') return first;
    if (first?.imageUrl) return first.imageUrl;
  }
  if (Array.isArray(item.smallImageUrls) && item.smallImageUrls.length) {
    const first = item.smallImageUrls[0];
    if (typeof first === 'string') return first;
    if (first?.imageUrl) return first.imageUrl;
  }
  return '';
}

function clearAll() {
  if (!confirm('検索条件と検索結果をクリアしますか？')) return;
  state.queries = Array.from({ length: MAX_ITEMS }, (_, i) => ({
    id: i + 1,
    enabled: i === 0,
    keyword: '',
    minPrice: '',
    maxPrice: '',
    excludeShops: ''
  }));
  state.results = {};
  state.selected = {};
  state.lastSummary = null;
  persistState();
  renderQueryRows();
  renderResults();
  renderSummary();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
    if (Array.isArray(parsed.queries)) {
      state.queries = parsed.queries.slice(0, MAX_ITEMS).map((q, idx) => ({
        id: idx + 1,
        enabled: Boolean(q.enabled),
        keyword: q.keyword || '',
        minPrice: q.minPrice || '',
        maxPrice: q.maxPrice || '',
        excludeShops: q.excludeShops || ''
      }));
      while (state.queries.length < MAX_ITEMS) {
        state.queries.push({ id: state.queries.length + 1, enabled: false, keyword: '', minPrice: '', maxPrice: '', excludeShops: '' });
      }
    }
    if (parsed.results) state.results = parsed.results;
    if (parsed.selected) state.selected = parsed.selected;
    if (parsed.lastSummary) state.lastSummary = parsed.lastSummary;
  } catch (error) {
    console.warn('loadState failed', error);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    queries: state.queries,
    results: state.results,
    selected: state.selected,
    lastSummary: state.lastSummary
  }));
}

function formatYen(value) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
