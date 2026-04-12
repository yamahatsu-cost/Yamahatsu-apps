function parseYen(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[¥,\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function decorateValueBlocks() {
  document.querySelectorAll('.metric, .summary-box').forEach((el) => {
    const valueEl = el.querySelector('.metric-value, .value');
    if (!valueEl) return;
    const text = valueEl.textContent.trim();
    const val = parseYen(text);
    const label = (el.querySelector('.metric-label, .label')?.textContent || '').trim();

    el.classList.remove('metric-positive', 'metric-negative');

    if (/実質価格|実質合計|実質/.test(label)) {
      el.classList.add('metric-positive');
      return;
    }

    if (val === null) return;
    if (text.startsWith('-')) {
      el.classList.add('metric-positive');
    } else if (text.startsWith('+')) {
      el.classList.add('metric-negative');
    }
  });
}

function addTouchHints() {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.setAttribute('tabindex', '0');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  decorateValueBlocks();
  addTouchHints();
  console.log('rakuten mobile finish loaded');
});
