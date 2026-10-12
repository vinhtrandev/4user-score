/* ══════════════════════════════════════════════════════════════
   chart.js — Sâm Lốc · Biến động chart page
   Depends on: app.js (history, numP, rules, TLBL)
══════════════════════════════════════════════════════════════ */

const BD_PALETTE = [
    '#2f7bff', '#13c98a', '#ff9d1c', '#ff4f93',
    '#9a5cff', '#16bde8', '#ff6b3d', '#c3cf2a',
];
const BD_DASH = [[], [6, 3], [2, 2], [4, 2, 1, 2], [8, 4], [3, 3], [1, 2], [6, 2, 2, 2]];

let bdChart = null;

// ══════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════
function renderChartPage() {
    const el = document.getElementById('bd-content');
    if (!history.length) {
        el.innerHTML = '<div class="bd-empty"><span class="bd-empty-icon">📈</span>Chưa có ván nào — hãy thêm ít nhất 1 ván trong tab 🃏 Chơi rồi quay lại đây!</div>';
        return;
    }

    const names = history[history.length - 1].names.slice(0, numP);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Cumulative scores
    const cumul = Array.from({ length: numP }, () => [0]);
    history.forEach(v => {
        for (let i = 0; i < numP; i++)
            cumul[i].push((cumul[i][cumul[i].length - 1] || 0) + (v.scores[i] || 0));
    });
    const totals = cumul.map(c => c[c.length - 1]);
    const order = [...Array(numP).keys()].sort((a, b) => totals[b] - totals[a]);

    const playerStats = computePlayerStats(names, cumul);

    el.innerHTML =
        buildHotBanner(names, playerStats, order) +
        buildStats(names, totals, order) +
        buildStatsTable(names, playerStats, order) +
        buildDoDoIndex(names, playerStats) +
        buildLegend(names, totals) +
        `<div class="bd-chart-wrap"><canvas id="bdChart"></canvas></div>` +
        buildLog(names);

    // Destroy old chart before creating new one
    if (bdChart) { try { bdChart.destroy(); } catch (e) { } bdChart = null; }
    drawChart(names, cumul, isDark);
}

// ══════════════════════════════════════════════════════════════
// COMPUTE PER-PLAYER STATS
// ══════════════════════════════════════════════════════════════
function computePlayerStats(names, cumul) {
    return names.map((_, pi) => {
        let wins = 0, losses = 0, chaySessions = 0, tuQuy = 0, batSessions = 0, xamOk = 0, xamFail = 0;
        let winStreak = 0, curStreak = 0, maxStreak = 0;

        history.forEach(v => {
            const sc = v.scores.slice(0, names.length);
            const maxSc = Math.max(...sc);
            // Win = điểm cao nhất VÀ dương
            const isWin = sc[pi] === maxSc && maxSc > 0;
            // Thua = điểm âm (hòa 0 không tính thua)
            const isLoss = sc[pi] < 0;
            const tags = v.tags[pi] || [];
            const hasChay = tags.some(t => (typeof t === 'string' ? t : t.tag) === 'C');
            const hasTq = tags.some(t => (typeof t === 'string' ? t : t.tag) === 'Q');
            const hasBat = tags.some(t => (typeof t === 'string' ? t : t.tag) === 'Qbat');
            const hasXam = tags.some(t => (typeof t === 'string' ? t : t.tag) === 'X');
            const hasXchan = tags.some(t => (typeof t === 'string' ? t : t.tag) === 'Xchan');

            if (isWin) { wins++; curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; }
            else { curStreak = 0; }
            if (isLoss) losses++;
            if (hasChay) chaySessions++;
            if (hasTq) tuQuy++;
            if (hasBat) batSessions++;
            if (hasXam) xamOk++;
            if (hasXchan) xamFail++;
        });
        winStreak = maxStreak;

        // Win-streak hiện tại (từ cuối)
        let curLiveStreak = 0;
        for (let vi = history.length - 1; vi >= 0; vi--) {
            const sc = history[vi].scores.slice(0, names.length);
            const maxSc = Math.max(...sc);
            if (sc[pi] === maxSc && maxSc > 0) curLiveStreak++;
            else break;
        }

        return { wins, losses, chaySessions, tuQuy, batSessions, xamOk, xamFail, winStreak, curLiveStreak };
    });
}

// ══════════════════════════════════════════════════════════════
// HOT BANNER — "Người đỏ nhất"
// ══════════════════════════════════════════════════════════════
function buildHotBanner(names, stats, order) {
    const leader = order[0];
    const name = names[leader];
    const st = stats[leader];
    const total = history.reduce((s, v) => s + (v.scores[leader] || 0), 0);
    const tqCount = stats.reduce((best, s, i) => s.tuQuy > best.count ? { i, count: s.tuQuy } : best, { i: -1, count: 0 });

    let badges = '';
    if (st.curLiveStreak >= 2)
        badges += `<span class="hb-badge hb-streak">📈 Win streak: ${st.curLiveStreak} ván</span>`;
    if (tqCount.count > 0)
        badges += `<span class="hb-badge hb-tq">🃏 Tứ quý nhiều nhất: ${tqCount.count} (${names[tqCount.i]})</span>`;

    return `<div class="bd-hot-banner">
    <div class="hb-glow"></div>
    <div class="hb-inner">
      <div class="hb-fire">🔥</div>
      <div class="hb-info">
        <div class="hb-label">Người đỏ nhất</div>
        <div class="hb-name">${name} <span class="hb-score">${total >= 0 ? '+' : ''}${Math.round(total)}</span></div>
        <div class="hb-badges">${badges}</div>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// STATS TABLE
// ══════════════════════════════════════════════════════════════
function buildStatsTable(names, stats, order) {
    let rows = '';
    order.forEach((pi, rank) => {
        const s = stats[pi];
        const rankIcon = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`;
        rows += `<tr>
      <td class="st-rank">${rankIcon}</td>
      <td class="st-name" style="color:${BD_PALETTE[pi % BD_PALETTE.length]}">${names[pi]}</td>
      <td class="st-win">${s.wins}</td>
      <td class="st-loss">${s.losses}</td>
      <td class="st-chay">${s.chaySessions}</td>
      <td class="st-tq">${s.tuQuy}</td>
      <td class="st-bat">${s.batSessions}</td>
      <td class="st-xam">${s.xamOk}</td>
      <td class="st-xchan">${s.xamFail}</td>
      <td class="st-streak">${s.winStreak}</td>
    </tr>`;
    });
    return `<div class="bd-section-title">📊 Bảng thống kê chi tiết</div>
  <div class="bd-stats-table-wrap">
    <table class="bd-stats-table">
      <thead><tr>
        <th></th><th>Người</th><th>Win 🏆</th><th>Thua 📉</th><th>Cháy ⚡</th><th>Tứ quý 🔥</th><th>Bị bắt TQ 🔒</th><th>Sâm ✓ 🎯</th><th>Bị chặn 🛡</th><th>Streak dài nhất 📈</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ĐỘ ĐỎ INDEX
// ══════════════════════════════════════════════════════════════
function buildDoDoIndex(names, stats) {
    const n = names.length;
    const totalVans = history.length || 1;

    // Tính raw score tuyệt đối (0-100 scale cố định)
    const rawScores = names.map((_, pi) => {
        const s = stats[pi];
        const winRate = s.wins / totalVans;           // 0-1
        const streakFactor = Math.min(s.winStreak / Math.max(totalVans * 0.5, 1), 1); // cap at 1
        const tqFactor = Math.min(s.tuQuy / Math.max(totalVans * 0.3, 1), 1);         // cap at 1
        const chayRate = s.chaySessions / totalVans;
        const batRate = s.batSessions / totalVans;

        const raw = (winRate * 55)
            + (streakFactor * 20)
            + (tqFactor * 15)
            - (chayRate * 25)
            - (batRate * 10)
            + 10; // base score

        return Math.max(0, Math.min(100, Math.round(raw)));
    });

    // Relative normalize: người cao nhất = 100%, người khác tỉ lệ
    // Nhưng chỉ normalize nếu max > 30 để tránh mọi người cùng thấp thành 100%
    const maxRaw = Math.max(...rawScores);
    const minRaw = Math.min(...rawScores);
    const spread = maxRaw - minRaw;

    const normalized = rawScores.map(s => {
        if (spread < 5) {
            // Mọi người gần bằng nhau → dùng giá trị tuyệt đối
            return Math.round(s);
        }
        // Spread đủ lớn → scale relative, người cao nhất = 100%
        return Math.round(((s - minRaw) / spread) * 85 + 15); // min 15%, max 100%
    });

    function doLabel(pct) {
        if (pct >= 85) return '🔥';
        if (pct >= 60) return '😎';
        if (pct >= 40) return '🍀';
        if (pct >= 20) return '😶';
        return '💀';
    }

    let items = '';
    // Sort by score desc
    const order2 = [...Array(n).keys()].sort((a, b) => normalized[b] - normalized[a]);
    order2.forEach(pi => {
        const pct = normalized[pi];
        const clr = BD_PALETTE[pi % BD_PALETTE.length];
        items += `<div class="dodo-item">
      <span class="dodo-icon">${doLabel(pct)}</span>
      <span class="dodo-name" style="color:${clr}">${names[pi]}</span>
      <div class="dodo-bar-wrap">
        <div class="dodo-bar" style="width:${pct}%;background:${clr}"></div>
      </div>
      <span class="dodo-pct">${pct}%</span>
    </div>`;
    });

    return `<div class="bd-section-title">🎰 Chỉ số Độ Đỏ™</div>
  <div class="bd-dodo">${items}</div>`;
}

// ══════════════════════════════════════════════════════════════
// STATS PANEL
// ══════════════════════════════════════════════════════════════
function buildStats(names, totals, order) {
    const leader = order[0];
    const loser = order[order.length - 1];
    const maxGain = Math.max(...history.map(v => Math.max(...v.scores.slice(0, numP))));
    const maxLoss = Math.min(...history.map(v => Math.min(...v.scores.slice(0, numP))));
    const trim = s => s.length > 8 ? s.slice(0, 7) + '…' : s;

    let html = '<div class="bd-stats">';
    html += stat('Tổng ván', history.length, 'neu');
    html += stat('Dẫn đầu', `${trim(names[leader])} <small>+${Math.round(totals[leader])}</small>`, 'pos', names[leader]);
    if (numP > 1)
        html += stat('Bét bảng', `${trim(names[loser])} <small>${Math.round(totals[loser])}</small>`, 'neg', names[loser]);
    html += stat('Thắng đậm nhất', '+' + Math.round(maxGain), 'pos');
    if (Math.round(maxLoss) < 0)
        html += stat('Thua đau nhất', Math.round(maxLoss), 'neg');
    html += '</div>';
    return html;
}

function stat(label, val, cls, title = '') {
    return `<div class="bd-stat">
    <div class="bd-stat-label">${label}</div>
    <div class="bd-stat-val ${cls}"${title ? ' title="' + title + '"' : ''}>${val}</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// LEGEND
// ══════════════════════════════════════════════════════════════
function buildLegend(names, totals) {
    let html = '<div class="bd-legend">';
    names.forEach((n, i) => {
        const t = totals[i];
        const clr = BD_PALETTE[i % BD_PALETTE.length];
        html += `<div class="bd-legend-item">
      <div class="bd-legend-dot" style="background:${clr}"></div>
      <span>${n} <strong style="color:${t >= 0 ? 'var(--green)' : 'var(--red)'}">${t >= 0 ? '+' : ''}${Math.round(t)}</strong></span>
    </div>`;
    });
    return html + '</div>';
}

// ══════════════════════════════════════════════════════════════
// LOG
// ══════════════════════════════════════════════════════════════
function buildLog(names) {
    const items = buildBdLog(history, names);
    if (!items.length) return '';
    return `<hr class="bd-divider">
    <div class="bd-section-title">Log "biến" nổi bật 🎭</div>
    <div class="bd-log">${items.join('')}</div>`;
}

function buildBdLog(hist, names) {
    const items = [];
    const perPersonMax = names.map((_, pi) => Math.max(...hist.map(v => v.scores[pi] || 0)));
    const perPersonMin = names.map((_, pi) => Math.min(...hist.map(v => v.scores[pi] || 0)));

    hist.forEach((v, vi) => {
        const vLabel = `V${vi + 1}`;

        // Sâm ván
        if (v.mode === 'xam') {
            const xamIdx = v.tags.findIndex(tl => tl.some(t => (typeof t === 'string' ? t : t.tag) === 'X'));
            const chanIdx = v.tags.findIndex(tl => tl.some(t => (typeof t === 'string' ? t : t.tag) === 'Chan'));
            const xcIdx = v.tags.findIndex(tl => tl.some(t => (typeof t === 'string' ? t : t.tag) === 'Xchan'));
            if (xamIdx >= 0 && xcIdx < 0) {
                const earn = v.scores[xamIdx];
                items.push(logRow(vLabel, 'b-xam',
                    `<strong>${names[xamIdx]}</strong> báo sâm thành công 🎯 — bỏ túi <strong style="color:var(--green)">+${Math.round(earn)}</strong>, mỗi người còn lại mất <strong style="color:var(--red)">-${Math.round(earn / (names.length - 1))}</strong>`));
            } else if (xcIdx >= 0 && chanIdx >= 0) {
                const penalty = Math.abs(v.scores[xcIdx]);
                items.push(logRow(vLabel, 'b-xam',
                    `<strong>${names[xcIdx]}</strong> báo sâm thất bại 😬 — bị <strong>${names[chanIdx]}</strong> chặn, mất <strong style="color:var(--red)">-${Math.round(penalty)}</strong>`));
            }
            return;
        }

        // Normal ván events
        const sc = v.scores.slice(0, names.length);
        const maxSc = Math.max(...sc);
        const minSc = Math.min(...sc);
        const winner = sc.indexOf(maxSc);
        const biggest = sc.indexOf(minSc);

        if (maxSc > 0 && maxSc === perPersonMax[winner])
            items.push(logRow(vLabel, 'b-win', `<strong>${names[winner]}</strong> thắng đậm nhất cả buổi 🏆 — thu về <strong style="color:var(--green)">+${Math.round(maxSc)}</strong>`));
        else if (maxSc >= 20)
            items.push(logRow(vLabel, 'b-win', `<strong>${names[winner]}</strong> thắng đậm 💰 — +${Math.round(maxSc)}`));

        if (minSc < 0 && minSc === perPersonMin[biggest])
            items.push(logRow(vLabel, 'b-chay', `<strong>${names[biggest]}</strong> thua đau nhất cả buổi 😭 — mất <strong style="color:var(--red)">${Math.round(minSc)}</strong>`));
        else if (minSc <= -20 && biggest !== winner)
            items.push(logRow(vLabel, 'b-chay', `<strong>${names[biggest]}</strong> thua đau 💸 — mất ${Math.round(minSc)}`));

        // Tứ quý
        const tqDanh = v.tags.findIndex(tl => tl.some(t => (typeof t === 'string' ? t : t.tag) === 'Q'));
        const tqBat = v.tags.findIndex(tl => tl.some(t => (typeof t === 'string' ? t : t.tag) === 'Qbat'));
        if (tqDanh >= 0 && tqBat >= 0)
            items.push(logRow(vLabel, 'b-tq', `<strong>${names[tqDanh]}</strong> đập tứ quý 🔥 — <strong>${names[tqBat]}</strong> bị bắt`));

        // Cháy bài
        v.tags.forEach((tl, ci) => {
            if (tl.some(t => (typeof t === 'string' ? t : t.tag) === 'C'))
                items.push(logRow(vLabel, 'b-chay', `<strong>${names[ci]}</strong> cháy bài ⚡ — bị cộng ${rules.chay} lá phạt`));
        });
    });

    return items.slice(-40);
}

function logRow(van, badgeCls, msg) {
    const badgeLabel = { 'b-xam': 'Sâm', 'b-tq': 'Tứ quý', 'b-chay': 'Phạt', 'b-win': 'Thắng' }[badgeCls] || '';
    return `<div class="bd-log-item">
    <span class="bd-log-van">${van}</span>
    <span class="bd-log-msg">${msg}</span>
    <span class="bd-log-badge ${badgeCls}">${badgeLabel}</span>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// CHART.JS RENDER
// ══════════════════════════════════════════════════════════════
function drawChart(names, cumul, isDark) {
    const ctx = document.getElementById('bdChart');
    if (!ctx) return;

    const gridColor = isDark ? 'rgba(130,160,255,.10)' : 'rgba(40,70,160,.09)';
    const zeroLine = isDark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.2)';
    const tickColor = isDark ? '#93a0d6' : '#5b6798';
    const tooltipBg = isDark ? '#10173f' : '#fff';
    const tooltipTitle = isDark ? '#eef2ff' : '#10173a';
    const tooltipBody = isDark ? '#b9c3f0' : '#44507f';
    const tooltipBorder = isDark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)';

    const labels = ['Đầu', ...history.map((_, i) => 'V' + (i + 1))];
    const ptRadius = history.length <= 15 ? 4 : (history.length <= 30 ? 3 : 2);

    const datasets = names.map((n, i) => ({
        label: n,
        data: cumul[i],
        borderColor: BD_PALETTE[i % BD_PALETTE.length],
        backgroundColor: BD_PALETTE[i % BD_PALETTE.length] + '18',
        borderWidth: 2.5,
        pointRadius: ptRadius,
        pointHoverRadius: 7,
        pointBackgroundColor: BD_PALETTE[i % BD_PALETTE.length],
        fill: false,
        tension: 0.32,
        borderDash: BD_DASH[i % BD_DASH.length],
    }));

    bdChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            animation: { duration: 400 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipTitle,
                    bodyColor: tooltipBody,
                    borderColor: tooltipBorder,
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y >= 0 ? '+' : ''}${Math.round(ctx.parsed.y)}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: tickColor, font: { size: 11 }, maxRotation: 0, autoSkip: history.length > 18 },
                },
                y: {
                    grid: {
                        color: ctx2 => ctx2.tick.value === 0 ? zeroLine : gridColor,
                        lineWidth: ctx2 => ctx2.tick.value === 0 ? 1.5 : 1,
                    },
                    ticks: {
                        color: tickColor,
                        font: { size: 11 },
                        callback: v => (v >= 0 ? '+' : '') + Math.round(v),
                    },
                },
            },
        },
    });
}