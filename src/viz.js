/* 통계 그래프: 외부 라이브러리 없이 SVG로 그린다. 구성은 '시설불편민원 분석도구'의 분야별·월별·시간별 현황을 따른다. */
const SERIES_1 = 'var(--series-1)', SERIES_2 = 'var(--series-2)';
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
const BANDS = [['6~9시', 6, 9], ['9~11시', 9, 11], ['11~13시', 11, 13], ['13~15시', 13, 15], ['15~18시', 15, 18], ['18~20시', 18, 20], ['20~22시', 20, 22], ['22~6시', 22, 6]];
const VIZ = { W: 520, tips: [] };

/* ---------- 계산 ---------- */
const hoursOf = r => {
  if (!r.dt || !r.doneAt) return null;
  const h = (new Date(r.doneAt) - new Date(r.dt)) / 3600000;
  return h >= 0 ? h : null;
};
function avgHours(rows) {
  const hs = rows.map(hoursOf).filter(h => h !== null);
  return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null;
}
function fmtHours(h) {
  if (h === null || h === undefined) return '-';
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 48) {
    const total = Math.round(h * 60);
    return total % 60 ? `${Math.floor(total / 60)}시간 ${total % 60}분` : `${total / 60}시간`;
  }
  return `${(h / 24).toFixed(1)}일`;
}
function bandOf(dt) {
  const h = Number(dt.slice(11, 13));
  if (h >= 22 || h < 6) return 7;
  return BANDS.findIndex(b => h >= b[1] && h < b[2]);
}
function metrics(rows) { // 만족도는 해피콜 응답 건만 평균한다. 응답이 없으면 0이 아니라 없음(null)이다.
  const scores = rows.map(r => Number(r.happy)).filter(n => n >= 1 && n <= 5);
  return {
    count: rows.length,
    happy: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    sameDay: rows.length ? rows.filter(r => duration(r.dt, r.doneAt) === '당일').length / rows.length * 100 : null,
  };
}
function calcViz(year, month, field = '') {
  const now = new Date();
  const monthOf = r => Number(r.dt.slice(5, 7));
  const inYear = r => yearOf(r) === year;
  const inRange = r => inYear(r) && (!month || monthOf(r) === month);
  const inField = r => !field || r.fieldL === field;
  const fac = records.filter(r => r.kind === 'facility' && inRange(r) && inField(r));
  const oth = records.filter(r => r.kind === 'other' && inRange(r));
  const facYear = records.filter(r => r.kind === 'facility' && inYear(r) && inField(r));
  const othYear = records.filter(r => r.kind === 'other' && inYear(r));
  const dataLast = Math.max(0, ...[...facYear, ...othYear].map(monthOf));
  const lastM = Math.max(year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0, dataLast);
  const trend = rows => { // 기록이 시작된 달부터 표시한다
    const first = rows.length ? Math.min(...rows.map(monthOf)) : 13;
    return Array.from({ length: 12 }, (_, i) => (i + 1 < first || i + 1 > lastM ? null : rows.filter(r => monthOf(r) === i + 1).length));
  };
  const facMonths = MONTHS.map((_, i) => facYear.filter(r => monthOf(r) === i + 1));
  const countBy = (rows, keyFn) => {
    const m = new Map();
    rows.forEach(r => { const k = keyFn(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ko')).slice(0, 10);
  };
  const groupKey = field ? 'fieldM' : 'fieldL';
  const known = field ? Object.keys(CLASS.fields[field] || {}) : FIELDS;
  const groups = [...known, ...uniq(fac.map(r => r[groupKey])).filter(k => !known.includes(k))];
  const byGroup = groups.map(label => {
    const rs = fac.filter(r => r[groupKey] === label);
    return { label, ...metrics(rs), done: rs.filter(r => r.status === '완료').length, wip: rs.filter(r => r.status !== '완료').length };
  });
  const whole = metrics(fac);
  return {
    facTotal: fac.length, othTotal: oth.length, ...whole,
    done: fac.filter(r => r.status === '완료').length, wip: fac.filter(r => r.status !== '완료').length,
    avg: avgHours(fac), avgCount: fac.filter(r => hoursOf(r) !== null).length,
    byGroup,
    trendFac: trend(facYear), trendOth: trend(othYear),
    monthHappy: facMonths.map(rs => metrics(rs).happy), monthSameDay: facMonths.map(rs => metrics(rs).sameDay), avgByMonth: facMonths.map(avgHours),
    bands: BANDS.map((_, i) => metrics(fac.filter(r => bandOf(r.dt) === i))),
    byDuration: ['당일', '3일이내', '3일초과'].map(k => ({ label: k, value: fac.filter(r => duration(r.dt, r.doneAt) === k).length })),
    topItems: countBy(fac, r => (r.fieldS ? (r.fieldS === '기타' ? `${r.fieldM} 기타` : r.fieldS) : '')),
    topOrgs: countBy(oth, r => r.org),
  };
}

/* ---------- 그리기 ---------- */
function niceTicks(max, integer) {
  const top0 = max > 0 ? max : 1;
  const rough = top0 / 4, p = 10 ** Math.floor(Math.log10(rough)), m = rough / p;
  let step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  if (integer) step = Math.max(1, Math.round(step));
  const ticks = [];
  for (let t = 0; t < top0 + step - 1e-9; t += step) ticks.push(Number(t.toFixed(4)));
  return ticks;
}
function tipId(title, rows) { VIZ.tips.push({ title, rows }); return VIZ.tips.length - 1; }
function legendHtml(items, shape) {
  return `<div class="viz-legend">${items.map(i => `<span><i class="key ${shape}" style="background:${i.color}"></i>${esc(i.name)}</span>`).join('')}</div>`;
}
function tableHtml(heads, rows) {
  return `<details class="viz-table no-print"><summary>표로 보기</summary><table class="report"><thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}
function vizCard(id, title, sub, body) {
  return `<div class="viz-card" id="${id}"><h3>${esc(title)}</h3><p class="hint">${esc(sub)}</p>${body}</div>`;
}
function yAxis(ticks, y, l, r) {
  return ticks.map(t => `<line class="${t === 0 ? 'axis' : 'grid'}" x1="${l}" x2="${r}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('');
}
function lineChart(series, { labels, ticks, fmt, tipFmt, aria }) {
  const H = 230, l = 34, r = VIZ.W - 34, t = 14, b = H - 26, n = labels.length;
  const all = series.flatMap(s => s.values.filter(v => v !== null));
  const tk = ticks || niceTicks(Math.max(0, ...all), true), top = tk[tk.length - 1];
  const x = i => l + (r - l) * (i + 0.5) / n, y = v => b - (b - t) * v / top;
  const ends = series.map(s => { let i = n - 1; while (i >= 0 && s.values[i] === null) i--; return i; });
  const lines = series.map((s, si) => {
    let out = '', run = [];
    const flush = () => {
      if (run.length > 1) out += `<polyline class="viz-line" points="${run.map(i => `${x(i)},${y(s.values[i])}`).join(' ')}" style="stroke:${s.color}"/>`;
      else if (run.length === 1 && run[0] !== ends[si]) out += `<circle class="viz-dot" cx="${x(run[0])}" cy="${y(s.values[run[0]])}" r="4" style="fill:${s.color}"/>`;
      run = [];
    };
    s.values.forEach((v, i) => { if (v === null) flush(); else run.push(i); });
    flush();
    if (ends[si] >= 0) out += `<circle class="viz-dot" cx="${x(ends[si])}" cy="${y(s.values[ends[si]])}" r="4" style="fill:${s.color}"/>`;
    return out;
  }).join('');
  const marks = series.map((s, si) => ({ i: ends[si], v: ends[si] >= 0 ? s.values[ends[si]] : null })).filter(e => e.i >= 0);
  const clash = marks.length === 2 && Math.abs(x(marks[0].i) - x(marks[1].i)) < 40 && Math.abs(y(marks[0].v) - y(marks[1].v)) < 15;
  const endText = clash ? '' : marks.map(e => `<text class="viz-val" x="${x(e.i) + 8}" y="${y(e.v) + 4}">${esc(fmt(e.v))}</text>`).join('');
  const cols = labels.map((m, i) => {
    const rows = series.map(s => ({ color: s.color, name: s.name, value: s.values[i] === null ? '기록 없음' : (tipFmt || fmt)(s.values[i]) }));
    return `<g class="col" tabindex="0" data-t="${tipId(m, rows)}" aria-label="${esc(m)}: ${esc(rows.map(o => `${o.name} ${o.value}`).join(', '))}"><rect class="hit" x="${l + (r - l) * i / n}" y="${t}" width="${(r - l) / n}" height="${b - t}"/><line class="xh" x1="${x(i)}" x2="${x(i)}" y1="${t}" y2="${b}"/></g><text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(m)}</text>`;
  }).join('');
  return `<svg class="viz" viewBox="0 0 ${VIZ.W} ${H}" role="group" aria-label="${esc(aria)}">${yAxis(tk, y, l, r)}${lines}${endText}${cols}</svg>`;
}
function columnChart(values, { labels, ticks, name, fmt, tipFmt, aria }) {
  const H = 210, l = 34, r = VIZ.W - 10, t = 18, b = H - 26, n = labels.length;
  const nums = values.filter(v => v !== null);
  const max = Math.max(0, ...nums);
  const tk = ticks || niceTicks(max, false), top = tk[tk.length - 1];
  const band = (r - l) / n, w = Math.min(24, band * 0.6);
  const y = v => b - (b - t) * v / top;
  const peak = values.indexOf(max);
  const cols = values.map((v, i) => {
    const cx = l + band * (i + 0.5);
    const rows = [{ color: SERIES_1, name, value: v === null ? '기록 없음' : (tipFmt || fmt)(v) }];
    const h = v === null ? 0 : b - y(v);
    const rad = Math.min(4, h, w / 2);
    const bar = h > 0 ? `<path class="viz-bar" style="fill:${SERIES_1}" d="M${cx - w / 2} ${b}V${b - h + rad}a${rad} ${rad} 0 0 1 ${rad} ${-rad}H${cx + w / 2 - rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}V${b}Z"/>` : '';
    const label = i === peak && max > 0 ? `<text class="viz-val" x="${cx}" y="${b - h - 5}" text-anchor="middle">${esc(fmt(v))}</text>` : '';
    return `<g class="col" tabindex="0" data-t="${tipId(labels[i], rows)}" aria-label="${esc(labels[i])}: ${esc(rows[0].value)}"><rect class="hit" x="${l + band * i}" y="${t}" width="${band}" height="${b - t}"/>${bar}</g>${label}<text class="tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`;
  }).join('');
  return `<svg class="viz" viewBox="0 0 ${VIZ.W} ${H}" role="group" aria-label="${esc(aria)}">${yAxis(tk, y, l, r)}${cols}</svg>`;
}
function hbarChart(rows, segs, { aria, max, text, tipFmt, labelW = 44 }) {
  const rowH = 30, thick = 16, H = rows.length * rowH + 4, l = 112, r = VIZ.W - labelW;
  const total = o => segs.reduce((a, s) => a + (o[s.key] || 0), 0);
  const scale = max || Math.max(1, ...rows.map(total));
  const body = rows.map((o, i) => {
    const y = 4 + i * rowH;
    const short = o.label.length > 9 ? `${o.label.slice(0, 8)}…` : o.label;
    const tf = tipFmt || (v => `${v}건`);
    const tipRows = segs.map(s => ({ color: s.color, name: s.name, value: o[s.key] === null ? '기록 없음' : tf(o[s.key]) }));
    let x = l, marks = '';
    const live = segs.filter(s => o[s.key] > 0);
    live.forEach((s, si) => {
      const gap = si < live.length - 1 ? 2 : 0;
      const w = Math.max(1, (r - l) * o[s.key] / scale - gap);
      const isEnd = si === live.length - 1, rad = isEnd ? Math.min(4, w) : 0;
      marks += `<path class="viz-bar" style="fill:${s.color}" d="M${x} ${y}H${x + w - rad}${rad ? `a${rad} ${rad} 0 0 1 ${rad} ${rad}V${y + thick - rad}a${rad} ${rad} 0 0 1 ${-rad} ${rad}` : `V${y + thick}`}H${x}Z"/>`;
      x += w + gap;
    });
    const valueText = text ? text(o) : String(total(o));
    return `<g class="col" tabindex="0" data-t="${tipId(o.label, tipRows)}" aria-label="${esc(o.label)}: ${esc(tipRows.map(t => `${t.name} ${t.value}`).join(', '))}"><rect class="hit" x="0" y="${y - 7}" width="${VIZ.W}" height="${rowH}"/><text class="tick strong" x="${l - 8}" y="${y + 13}" text-anchor="end">${esc(short)}</text>${marks}<text class="viz-val" x="${x + 6}" y="${y + 13}">${esc(valueText)}</text></g>`;
  }).join('');
  return `<svg class="viz" viewBox="0 0 ${VIZ.W} ${H}" role="group" aria-label="${esc(aria)}"><line class="axis" x1="${l}" x2="${l}" y1="0" y2="${H}"/>${body}</svg>`;
}

/* ---------- 화면 구성 ---------- */
const NO_DATA = '<p class="viz-empty">표시할 데이터가 없습니다.</p>';
const fmtScore = v => (v === null || v === undefined ? '-' : v.toFixed(1));
const fmtRate = v => (v === null || v === undefined ? '-' : `${Math.round(v)}%`);
const RATE_TICKS = [0, 25, 50, 75, 100], SCORE_TICKS = [0, 1, 2, 3, 4, 5];
function vizHtml(year, month, field) {
  VIZ.tips = [];
  const v = calcViz(year, month, field);
  const scope = `${year}년${month ? ` ${month}월` : ''}`;
  const who = field ? `${field} 분야` : '전체';
  const facName = field ? `${field} 민원` : '시설불편';
  const facSeries = { name: facName, color: SERIES_1, values: v.trendFac };
  const othSeries = { name: '시설 외', color: SERIES_2, values: v.trendOth };
  const trendSeries = field ? [facSeries] : [facSeries, othSeries];
  const hasTrend = trendSeries.some(s => s.values.some(x => x !== null));
  const avgs = v.avgByMonth.filter(x => x !== null);
  const useDays = avgs.length && Math.max(...avgs) >= 48;
  const unit = useDays ? '일' : '시간', div = useDays ? 24 : 1;
  const hasAny = arr => arr.some(x => x !== null);
  const single = (rows, name, opts = {}) => hbarChart(rows, [{ key: 'value', name, color: SERIES_1 }], { aria: name, ...opts });
  const countTable = (head, rows) => tableHtml([head, '건수'], rows.map(o => [o.label, o.value]));
  const rate = v.facTotal ? `${Math.round(v.done / v.facTotal * 100)}%` : '-';
  const groupHead = field ? `${field} 중분류` : '분야';
  const T = v.facTotal;
  const happyRows = v.byGroup.map(o => ({ label: o.label, value: o.happy }));
  const dayRows = v.byGroup.map(o => ({ label: o.label, value: o.sameDay }));
  const bandLabels = BANDS.map(b => b[0]);
  const bandCounts = v.bands.map(b => b.count);
  return `<div class="viz-wrap">
    <div class="tiles" id="vizTiles">
      <div class="tile"><span class="t-label">접수 (${esc(who)})</span><span class="t-value">${v.facTotal}건</span><span class="t-sub">${esc(scope)}</span></div>
      <div class="tile"><span class="t-label">처리 완료율</span><span class="t-value">${rate}</span><span class="t-sub">처리중 ${v.wip}건</span></div>
      <div class="tile"><span class="t-label">당일 처리율</span><span class="t-value">${fmtRate(v.sameDay)}</span><span class="t-sub">접수 건 대비</span></div>
      <div class="tile"><span class="t-label">평균 처리시간</span><span class="t-value">${esc(fmtHours(v.avg))}</span><span class="t-sub">완료 ${v.avgCount}건 기준</span></div>
      <div class="tile"><span class="t-label">만족도 (해피콜)</span><span class="t-value">${fmtScore(v.happy)}${v.happy === null ? '' : '점'}</span><span class="t-sub">5점 만점</span></div>
      <div class="tile"><span class="t-label">시설 외 접수</span><span class="t-value">${v.othTotal}건</span><span class="t-sub">${esc(scope)}</span></div>
    </div>
    <h3 class="viz-section">□ 분야별 현황 (${esc(who)}, ${esc(scope)})</h3>
    <div class="viz-grid">
      ${vizCard('vField', `${groupHead}별 접수`, '단위: 건 (비율)',
        (T ? legendHtml([{ name: '처리완료', color: SERIES_1 }, { name: '처리중', color: SERIES_2 }], 'rect')
          + hbarChart(v.byGroup, [{ key: 'done', name: '처리완료', color: SERIES_1 }, { key: 'wip', name: '처리중', color: SERIES_2 }], { aria: `${groupHead}별 접수`, labelW: 84, text: o => `${o.count}건 (${Math.round(o.count / T * 100)}%)` }) : NO_DATA)
        + tableHtml([groupHead, '접수', '비율', '처리완료', '처리중'], v.byGroup.map(o => [o.label, o.count, T ? `${Math.round(o.count / T * 100)}%` : '-', o.done, o.wip])))}
      ${vizCard('vFieldHappy', `${groupHead}별 만족도`, '5점 만점 · 해피콜 응답 건 평균',
        (hasAny(happyRows.map(o => o.value)) ? single(happyRows, '만족도', { max: 5, text: o => fmtScore(o.value), tipFmt: fmtScore }) : NO_DATA)
        + tableHtml([groupHead, '만족도'], happyRows.map(o => [o.label, fmtScore(o.value)])))}
      ${vizCard('vFieldDay', `${groupHead}별 당일 처리율`, '단위: % · 접수 건 대비',
        (T ? single(dayRows, '당일 처리율', { max: 100, text: o => fmtRate(o.value), tipFmt: fmtRate }) : NO_DATA)
        + tableHtml([groupHead, '당일 처리율'], dayRows.map(o => [o.label, fmtRate(o.value)])))}
    </div>
    <h3 class="viz-section">□ 월별 현황 (${esc(who)}, ${year}년)</h3>
    <div class="viz-grid">
      ${vizCard('vTrend', '월별 접수 추이', '단위: 건 · 대장 기록이 시작된 달부터 표시',
        (hasTrend ? (trendSeries.length > 1 ? legendHtml(trendSeries, 'line') : '') + lineChart(trendSeries, { labels: MONTHS, fmt: x => String(x), tipFmt: x => `${x}건`, aria: '월별 접수 추이' }) : NO_DATA)
        + tableHtml(['월', ...trendSeries.map(s => s.name)], MONTHS.map((m, i) => [m, ...trendSeries.map(s => s.values[i] ?? '-')])))}
      ${vizCard('vAvg', '월별 평균 처리시간', `단위: ${unit} · 접수월 기준, 달력 시간`,
        (avgs.length ? columnChart(v.avgByMonth.map(x => (x === null ? null : x / div)), { labels: MONTHS, name: '평균 처리시간', fmt: x => String(Number(x.toFixed(1))), tipFmt: x => fmtHours(x * div), aria: `월별 평균 처리시간(단위 ${unit})` }) : NO_DATA)
        + tableHtml(['월', '평균 처리시간'], MONTHS.map((m, i) => [m, fmtHours(v.avgByMonth[i])])))}
      ${vizCard('vMonthDay', '월별 당일 처리율', '단위: %',
        (hasAny(v.monthSameDay) ? lineChart([{ name: '당일 처리율', color: SERIES_1, values: v.monthSameDay }], { labels: MONTHS, ticks: RATE_TICKS, fmt: fmtRate, aria: '월별 당일 처리율' }) : NO_DATA)
        + tableHtml(['월', '당일 처리율'], MONTHS.map((m, i) => [m, fmtRate(v.monthSameDay[i])])))}
      ${vizCard('vMonthHappy', '월별 만족도', '5점 만점',
        (hasAny(v.monthHappy) ? lineChart([{ name: '만족도', color: SERIES_1, values: v.monthHappy }], { labels: MONTHS, ticks: SCORE_TICKS, fmt: fmtScore, aria: '월별 만족도' }) : NO_DATA)
        + tableHtml(['월', '만족도'], MONTHS.map((m, i) => [m, fmtScore(v.monthHappy[i])])))}
    </div>
    <h3 class="viz-section">□ 시간별 현황 (${esc(who)}, ${esc(scope)})</h3>
    <div class="viz-grid">
      ${vizCard('vBand', '시간대별 접수', '단위: 건 · 접수 시각 기준',
        (T ? columnChart(bandCounts, { labels: bandLabels, name: '접수', fmt: x => String(x), tipFmt: x => `${x}건`, aria: '시간대별 접수' }) : NO_DATA)
        + tableHtml(['시간대', '접수'], bandLabels.map((m, i) => [m, bandCounts[i]])))}
      ${vizCard('vBandDay', '시간대별 당일 처리율', '단위: %',
        (T ? columnChart(v.bands.map(b => b.sameDay), { labels: bandLabels, ticks: RATE_TICKS, name: '당일 처리율', fmt: fmtRate, aria: '시간대별 당일 처리율' }) : NO_DATA)
        + tableHtml(['시간대', '당일 처리율'], bandLabels.map((m, i) => [m, fmtRate(v.bands[i].sameDay)])))}
      ${vizCard('vBandHappy', '시간대별 만족도', '5점 만점',
        (hasAny(v.bands.map(b => b.happy)) ? columnChart(v.bands.map(b => b.happy), { labels: bandLabels, ticks: SCORE_TICKS, name: '만족도', fmt: fmtScore, aria: '시간대별 만족도' }) : NO_DATA)
        + tableHtml(['시간대', '만족도'], bandLabels.map((m, i) => [m, fmtScore(v.bands[i].happy)])))}
    </div>
    <h3 class="viz-section">□ 처리기간·주요 민원 (${esc(who)}, ${esc(scope)})</h3>
    <div class="viz-grid">
      ${vizCard('vDur', '소요기간 분포', '단위: 건 · 완료 건, 업무일 기준(주말·공휴일 제외)',
        (v.byDuration.some(o => o.value) ? single(v.byDuration, '소요기간') : NO_DATA) + countTable('소요기간', v.byDuration))}
      ${vizCard('vTop', '자주 발생하는 민원 상위 10', '단위: 건 · 소분류 기준',
        (v.topItems.length ? single(v.topItems, '민원 건수') : NO_DATA) + countTable('소분류', v.topItems))}
      ${vizCard('vOrg', '시설 외 민원 기관 상위 10', '단위: 건 · 분야 선택과 무관',
        (v.topOrgs.length ? single(v.topOrgs, '기관별 건수') : NO_DATA) + countTable('기관', v.topOrgs))}
    </div>
    <p class="hint viz-note">* 소요기간은 업무일 기준이고, 평균 처리시간은 접수부터 처리까지의 달력 시간(밤·휴일 포함)입니다. 대장에 분이 비어 있으면 0분으로 계산합니다.</p>
  </div>`;
}
