/* ══════════════════════════════════════════════════════════════
   bridge.js — Sâm Lốc · Cầu nối extension "FB Game Ad Blocker"

   Extension chỉ gửi DỮ LIỆU THÔ của từng ván vào window.fbGameResult(game).
   File này KHÔNG tính điểm. Nó chỉ đọc dữ kiện (số lá còn lại, người thắng,
   cháy/cóng, chuỗi tứ quý, báo sâm) rồi ĐIỀN VÀO FORM và gọi đúng
   các hàm có sẵn của app.js (updateCardState, pickTq, pickXam, pickChan,
   handleAddVan...). Mọi luật tính tiền (rules.la / xw / xl / tq / chay,
   ...) vẫn do app.js quyết định — không bị sửa. Web KHÔNG áp đền làng cho ván từ extension (ghi như ván thường).

   Chế độ TỰ ĐỘNG: nhận ván là tự nhập + tự lưu, không cần thao tác tay.

   Nhận diện người chơi theo TÊN (không theo ghế): văng/vào lại sai ghế vẫn cộng đúng cột;
   người không có mặt trong ván = "vắng" (bỏ qua ván đó). Xem assignColumns().

   Nạp SAU app.js trong index.html.
══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const LS_SEEN = 'xamloc_fb_seen';   // id các ván đã nhận (chống trùng)
    const LS_SEATS = 'xamloc_fb_seats';  // (cũ) ghế→cột; không còn dùng, chỉ dọn khi xóa bộ nhớ chống trùng
    const LS_STAT = 'xamloc_fb_stat';   // thống kê hiển thị ở tab Dữ liệu

    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const clean = (s) => String(s == null ? '' : s).replace(/["<>&]/g, '').trim().slice(0, 24);
    const isGenericName = (s) => !s || /^Gh(ế|e)\s*\d*$/i.test(s);

    // ── Từ timeline của ván suy ra các dữ kiện (không tính tiền) ──────────────
    function derive(game) {
        const out = { sams: null, white: false, chains: [], chops: null };
        const R = { top: null, chain: null, done: [] };
        const endRound = () => { if (R.chain) R.done.push(R.chain); R.chain = null; R.top = null; };
        for (const e of game.events || []) {
            if (e.k === 'ev') {
                if (e.name === 'pass_turn') {
                    if (e.arg === 255) endRound();
                } else if (e.name === 'challenge_fail') out.sams = 'fail';
                else if (e.name === 'challenge_start' && !out.sams) out.sams = 'start';
                else if (e.name === 'white_win') out.white = true;
            } else if (e.k === 'play') {
                const n = e.cards.length, seat = e.seat;
                if (e.kind != null) {
                    const quad = n === 4 && e.cards.every((c) => c % 13 === e.cards[0] % 13);
                    const two = n === 1 && e.cards[0] % 13 === 1;
                    if (quad && R.top && R.top.seat !== seat) {
                        if (R.top.two) {
                            if (R.chain) R.done.push(R.chain);
                            R.chain = { n: 1, att: seat, vic: R.top.seat, seats: [R.top.seat, seat] };
                        } else if (R.top.quad && R.chain && R.chain.att === R.top.seat) {
                            R.chain = { n: R.chain.n + 1, att: seat, vic: R.top.seat, seats: R.chain.seats.concat(seat) };
                        }
                    }
                    R.top = { seat, quad, two };
                }
            } else if (e.k === 'chop') {
                out.chops = out.chops || {};
                out.chops[e.seat] = (out.chops[e.seat] || 0) + e.xu;
            }
        }
        out.chains = R.done.concat(R.chain ? [R.chain] : []);
        return out;
    }

    // ── Người chơi (extension) → CỘT điểm trên web: gán theo TÊN, không theo ghế ──
    // Ghế đổi mỗi lần văng/vào lại nên không dùng để nhận diện. Mỗi tên = 1 cột ổn định (tối đa MAXCOL).
    //  • Người có mặt trong ván  → cộng đúng cột của họ, ngồi ghế nào cũng được.
    //  • Cột không có người trong ván này → "vắng": bỏ qua ván đó (không tính, không trừ điểm).
    //  • Tên mới, còn cột trống → thêm cột. Đã đủ MAXCOL cột → thế chỗ cột vắng lâu nhất + CẢNH BÁO.
    const MAXCOL = 4;
    const norm = (s) => clean(s).replace(/\s+/g, ' ');
    const isDefaultCol = (s) => !s || /^Người\s*\d+$/i.test(String(s).trim());

    // Ván gần nhất mà cột c có mặt (-1 nếu chưa từng) — dùng chọn "vắng lâu nhất"
    function lastPresence(c) {
        for (let k = history.length - 1; k >= 0; k--) {
            const v = history[k];
            if (!(v.absent && v.absent.includes(c))) return k;
        }
        return -1;
    }

    // Thuần quyết định, KHÔNG sửa state (applyPlayers mới áp dụng).
    function assignColumns(P) {
        const A = { map: {}, absent: [], why: [], info: [], rename: {}, total: numP, fresh: false };
        const sorted = P.slice().sort((a, b) => a.seat - b.seat);

        // Buổi mới (chưa có ván nào): cột theo thứ tự ghế, đặt tên theo người chơi
        if (!history.length) {
            A.fresh = true; A.total = sorted.length;
            sorted.forEach((p, i) => {
                A.map[p.seat] = i;
                const nm = clean(p.name);
                if (!isGenericName(nm)) A.rename[i] = nm;
            });
            return A;
        }

        const colName = [];
        for (let c = 0; c < numP; c++) colName[c] = norm(pnames[c] || '');
        const used = new Set();
        const unresolved = [];
        for (const p of sorted) {
            const nm = norm(p.name);
            let col = -1;
            if (!isGenericName(nm)) col = colName.findIndex((n, c) => n === nm && !used.has(c));
            if (col >= 0) { used.add(col); A.map[p.seat] = col; continue; }
            if (isGenericName(nm)) A.why.push(`ghế ${p.seat} không có tên thật — không nhận diện được người chơi`);
            else if (colName.includes(nm)) A.why.push(`2 người cùng tên «${nm}» trong 1 ván — web coi là một người`);
            unresolved.push(p);
        }
        const matched = used.size;

        let total = numP;
        for (const p of unresolved) {
            const nm = norm(p.name), generic = isGenericName(nm);
            let col = -1;
            // 1) cột còn để tên mặc định ("Người N") chưa ai dùng → nhận luôn
            for (let c = 0; c < numP; c++) if (!used.has(c) && isDefaultCol(pnames[c])) { col = c; break; }
            if (col < 0 && total < MAXCOL) {                      // 2) còn chỗ → thêm cột mới
                col = total++;
                A.info.push(`➕ thêm cột cho «${nm}»`);
            } else if (col < 0) {                                  // 3) đủ cột → thế chỗ người vắng lâu nhất
                const cand = [...Array(total).keys()].filter((c) => !used.has(c))
                    .sort((a, b) => lastPresence(a) - lastPresence(b) || a - b);
                col = cand.length ? cand[0] : 0;
                A.why.push(`«${nm}» là người mới (đã đủ ${MAXCOL} cột) — tạm thế vào cột «${pnames[col]}» (vắng lâu nhất); điểm cũ của cột này là của người cũ, hãy soát lại`);
            }
            used.add(col); A.map[p.seat] = col;
            if (!generic) A.rename[col] = nm;
        }
        if (matched === 0) A.why.push('toàn bộ người chơi đều là tên mới — có thể là nhóm khác, nên bấm "Ván mới" để tách buổi');
        for (let c = 0; c < total; c++) if (!used.has(c)) A.absent.push(c);
        A.total = total;
        return A;
    }

    // ── Phân tích ván thành "kế hoạch điền form" ─────────────────────────────
    function plan(game) {
        const why = [];                       // lý do cần người kiểm tra lại
        const P = (game.players || []).map((p) => Object.assign({}, p));
        if (P.length < 2 || P.length > 4) return { skip: `ván có ${P.length} người, web chỉ hỗ trợ 2–4` };
        const A = assignColumns(P);
        const idx = (seat) => A.map[seat];
        why.push(...A.why);
        // Số ghế lúc chia bài khác lúc kết thúc → có người ra/vào GIỮA ván: điểm lá vẫn đúng (theo tên),
        // nhưng tứ quý dựa trên số ghế nên cần người soát.
        const hs = Object.keys(game.hands || {}).map(Number);
        if (hs.length && (hs.length !== P.length || !P.every((p) => hs.includes(p.seat))))
            why.push('ghế lúc chia bài khác lúc kết thúc (có người ra/vào giữa ván) — soát lại tứ quý');
        const d = derive(game);
        const lines = (game.result && game.result.lines) || [];
        const content = lines.map((x) => String(x).slice(String(x).indexOf(': ') + 2));
        const win = P.find((p) => p.win);
        if (game.recovered) why.push('ván bị đứt/khôi phục');
        if (game.incomplete) why.push('thiếu timeline');
        if (!win) { why.push('không xác định được người thắng'); }

        const whiteLine = content.some((x) => /thắng trắng|thua trắng/i.test(x));
        const samLine = content.some((x) => /sâm/i.test(x));
        const base = { A, absent: A.absent, why, win, P, d };

        // 1) Ăn trắng — web chưa có luật riêng: điền như "sâm thành công" và BẮT BUỘC người kiểm tra
        if (d.white || whiteLine) {
            A.info.push('⚪ Ăn trắng — tính như sâm thành công');
            return Object.assign(base, { kind: 'xam', declarer: win ? idx(win.seat) : -1, success: true, white: true });
        }

        // 2) Báo sâm
        if (d.sams || samLine) {
            const failed = d.sams === 'fail' || content.some((x) => /chặn/i.test(x));
            if (!failed) {
                const pos = P.filter((p) => p.delta > 0);
                if (!(pos.length === 1 && P.every((p) => p === pos[0] || p.delta <= 0))) why.push('kết quả xu không khớp sâm thành công');
                return Object.assign(base, { kind: 'xam', declarer: win ? idx(win.seat) : -1, success: true });
            }
            const lose = P.reduce((a, p) => (p.delta < a.delta ? p : a), P[0]);
            if (!win || lose === win) why.push('không xác định được người chặn/người báo sâm');
            return Object.assign(base, {
                kind: 'xam', declarer: idx(lose.seat), success: false, blocker: win ? idx(win.seat) : -1,
            });
        }

        // 3) Ván thường
        // Ghế "ma": không thắng, không cóng, 0 lá VÀ 0 xu → không được chia bài (ngồi chờ/vào hụt), coi là vắng.
        // Người thua thật luôn còn ≥1 lá (hoặc bị trừ xu) nên không thể trùng điều kiện này.
        const ghosts = win ? P.filter((p) => !p.win && p.left === 0 && (p.delta || 0) === 0 && !/cóng/i.test(p.line || '')) : [];
        const real = (ghosts.length && P.length - ghosts.length >= 2) ? P.filter((p) => !ghosts.includes(p)) : P;
        if (real !== P) {
            for (const g of ghosts) {
                const c = idx(g.seat);
                if (c != null && !A.absent.includes(c)) A.absent.push(c);
                A.info.push(`😴 «${clean(g.name) || 'ghế ' + g.seat}» 0 lá, 0 xu — coi là vắng (không được chia bài)`);
            }
        }
        const losers = real.filter((p) => !p.win);
        const cards = {};         // vị trí web → số lá nhập vào ô
        for (const p of real) {
            const i = idx(p.seat);
            if (p.win) { cards[i] = 0; continue; }
            const cong = /cóng/i.test(p.line || '');
            if (cong) cards[i] = 10;                     // web: 10 lá ⇒ tự bật "Cháy bài"
            else if (p.left == null) { why.push(`thiếu số lá của ${clean(p.name) || 'ghế ' + p.seat}`); cards[i] = null; }
            else cards[i] = Math.max(0, Math.min(10, p.left | 0));
        }

        // Ván thường mà có từ 2 người trở lên 0 lá → ghép người thắng/tên có thể sai (vd người bắt tứ quý nhiều xu hơn người hết bài)
        const zeroLa = real.filter((p) => cards[idx(p.seat)] === 0);
        if (zeroLa.length >= 2) why.push('có ' + zeroLa.length + ' người cùng 0 lá (' + zeroLa.map((p) => clean(p.name) || 'ghế ' + p.seat).join(', ') + ') — soát lại người thắng và tứ quý');

        // Tứ quý (web chỉ có 1 chuỗi mỗi ván → lấy chuỗi dài nhất)
        let chains = d.chains.map((c) => c.seats);
        let chainNote = '';
        if (!chains.length && d.chops) {
            const pos = Object.keys(d.chops).filter((q) => d.chops[q] > 0);
            const neg = Object.keys(d.chops).filter((q) => d.chops[q] < 0);
            chains = pos.map((a) => {
                const v = neg.find((q) => -d.chops[q] === d.chops[a]) || neg[0];
                return v != null ? [+v, +a] : null;
            }).filter(Boolean);
        }
        let tq = null;
        if (chains.length) {
            tq = chains.reduce((a, c) => (c.length >= a.length ? c : a), chains[0]);
            if (chains.length > 1) {
                chainNote = `Có ${chains.length} chuỗi tứ quý, web chỉ nhập được 1 (đã lấy chuỗi dài nhất). Các chuỗi: ` +
                    chains.map((c) => c.map((s) => clean((P.find((p) => p.seat === s) || {}).name) || 'ghế ' + s).join('→')).join(' | ');
                why.push('nhiều chuỗi tứ quý');
            }
            if (tq.some((s) => idx(s) == null)) { tq = null; why.push('chuỗi tứ quý có ghế lạ'); }
        }

        return Object.assign(base, {
            kind: 'normal', cards, tq: tq ? tq.map(idx) : null,
            winIdx: win ? idx(win.seat) : -1, chainNote,
        });
    }

    // ── Điền form bằng chính các hàm của app.js ───────────────────────────────
    function resetForm() {
        selXam = -1; selChan = -1; selTqChain = []; selChay = []; selWin = -1; selDenLang = -1; selAbsent = [];
        const cp = document.getElementById('chan-panel'); if (cp) cp.style.display = 'none';
        const tc = document.getElementById('xam-tc'); if (tc) tc.checked = false;
        const pk = document.getElementById('chan-picker'); if (pk) { pk.style.opacity = '1'; pk.style.pointerEvents = 'auto'; }
        setMode('normal');
        renderGrid(true);
        renderXamPickers();
    }

    function applyPlayers(pl) {
        const A = pl.A;
        if (A.fresh) {
            if (numP !== A.total) setPlayers(A.total);          // buổi mới: số cột = số người trong ván đầu
        } else if (A.total > numP) {
            growColumns(A.total, A.rename);                      // người mới còn chỗ: thêm cột (đệm ván cũ)
        }
        for (const c of Object.keys(A.rename)) pnames[+c] = A.rename[c];
        renderNames();   // dựng lại ô tên từ pnames TRƯỚC khi save() (save đọc tên từ ô nhập)
        save();
        renderXamPickers();
    }

    function fillNormal(pl) {
        resetForm();
        selAbsent = pl.absent.slice();          // người không có mặt trong ván này
        renderGrid(true);
        for (const key of Object.keys(pl.cards)) {
            const i = +key, v = pl.cards[i];
            if (v == null) continue;
            const el = document.getElementById('c' + i);
            if (!el) continue;
            el.value = v;
            updateCardState(i, String(v));        // hàm có sẵn: reset người thắng + tự bật cháy bài khi 10 lá
        }
        // Đối chiếu người thắng của server với cách web chọn người thắng
        const eff = [];
        for (let i = 0; i < numP; i++) {
            if (selAbsent.includes(i)) { eff.push(Infinity); continue; }
            const v = pl.cards[i];
            eff.push(v == null ? Infinity : ((rules.chayOn && selChay.includes(i)) ? v + rules.chay : v));
        }
        const min = Math.min(...eff);
        const tied = eff.map((v, i) => (v === min && min !== Infinity ? i : -1)).filter((i) => i >= 0);
        if (pl.winIdx >= 0) {
            if (tied.includes(pl.winIdx)) selWin = pl.winIdx;
            else pl.why.push('người thắng của server không phải người ít lá nhất');
        }
        renderGrid();
        if (rules.tqOn && pl.tq && pl.tq.length >= 2) selTqChain = pl.tq.slice();
        renderBonusPickers();
    }

    function fillXam(pl) {
        resetForm();
        selAbsent = pl.absent.slice();
        renderGrid(true); renderXamPickers();
        setMode('xam');
        if (pl.declarer == null || pl.declarer < 0) { pl.why.push('chưa xác định người báo sâm'); return; }
        pickXam(pl.declarer);                     // hàm có sẵn: mở khung chặn sâm
        if (pl.success) {
            document.getElementById('xam-tc').checked = true;
            toggleChan();
        } else if (pl.blocker != null && pl.blocker >= 0) {
            pickChan(pl.blocker);
        }
    }

    function showManual(on) {
        if (typeof setInputMode === 'function') {
            setInputMode(on ? 'manual' : 'auto');
        } else {
            const c = document.getElementById('van-input-card');
            if (c) c.style.display = on ? '' : 'none';
        }
    }

    // ── Điểm vào duy nhất (extension gọi cho mỗi ván) ─────────────────────────
    async function handle(game) {
        if (!game || !game.result || game.id == null) return;
        const seen = lsGet(LS_SEEN, []);
        if (seen.includes(game.id)) return;                            // chống trùng
        for (let t = 0; t < 50 && typeof addVan !== 'function'; t++) await sleep(200);

        const pl = plan(game);
        if (pl.skip) { showToast('🔌 Bỏ qua ván extension: ' + pl.skip, 4000); return; }
        seen.push(game.id);
        lsSet(LS_SEEN, seen.slice(-500));

        showManual(false);
        applyPlayers(pl);
        if (pl.kind === 'xam') fillXam(pl); else fillNormal(pl);

        // TỰ ĐỘNG HOÀN TOÀN: luôn bấm "Thêm ván" như người dùng (kèm âm thanh thành công/thất bại của web)
        const before = history.length;
        handleAddVan(null);
        for (let i = 0; i < 15 && history.length === before; i++) await sleep(100);
        const added = history.length > before;
        if (added && pl.white) {                 // ăn trắng: tiền tính như sâm, chỉ đổi nhãn hiển thị
            const v = history[history.length - 1];
            v.white = true;
            v.tags = (v.tags || []).map((tl) => tl.map((t) => t === 'X' ? 'W' : (t && t.tag === 'X') ? Object.assign({}, t, { tag: 'W' }) : t));
            save(); renderBoard();
        }
        const review = pl.why.length > 0;
        if (added) {
            // Ván dữ liệu thiếu/đứt vẫn được lưu, nhưng ghi chú lại để bạn biết ván nào nên soát
            const info = pl.A.info.length ? pl.A.info.join('; ') : '';
            const note = [review ? '⚠️ Extension: ' + pl.why.join('; ') : '', info, pl.chainNote].filter(Boolean).join(' — ');
            if (note) { vanNotes[history.length - 1] = note; save(); renderBoard(); }
            if (review) showToast('⚠️ Ván ' + history.length + ' cần soát: ' + pl.why.join('; '), 8000);
        } else {
            // Lưu thất bại (thiếu dữ liệu để web tính): đóng hộp thoại để không chặn ván kế, báo bằng toast
            try { closeModal(); } catch (_) { }
            showManual(true);   // lối thoát duy nhất: hiện lại form (đã điền sẵn) để bổ sung ván bị lỗi
            goPage('game');
            showToast('❌ Không lưu được ván từ extension' + (review ? ': ' + pl.why.join('; ') : '') + '. Đã hiện form điền sẵn — bổ sung rồi bấm Thêm ván.', 7000);
        }
        const st = lsGet(LS_STAT, { n: 0 });
        st.n++; st.last = Date.now(); st.review = review; st.failed = !added;
        lsSet(LS_STAT, st);
        renderStatus();
        await sleep(1500);                                             // chờ hiệu ứng nút xong trước khi nhận ván kế
    }

    let q = Promise.resolve();
    window.fbGameResult = (game) => {
        // Không bao giờ ném lỗi: nếu ném, extension coi như gửi thất bại và kẹt hàng đợi
        q = q.then(() => handle(game)).catch((e) => console.warn('[fb-bridge]', e));
        return true;
    };

    // ── Trạng thái ở tab 💾 Dữ liệu ───────────────────────────────────────────
    function renderStatus() {
        const st = lsGet(LS_STAT, null);
        const txt = st && st.n
            ? `Đã nhận ${st.n} ván · lần cuối ${new Date(st.last).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}${st.failed ? ' · ❌ ván cuối chưa lưu được' : st.review ? ' · ⚠️ ván cuối có ghi chú cần soát' : ''}`
            : 'Chưa nhận ván nào từ extension.';
        ['fb-status', 'fb-status-main'].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = txt; });
    }

    window.fbBridge = {
        clearSeen() { localStorage.removeItem(LS_SEEN); localStorage.removeItem(LS_SEATS); localStorage.removeItem(LS_STAT); renderStatus(); showToast('Đã xóa bộ nhớ chống trùng', 2000); },
        resetStat() { localStorage.removeItem(LS_STAT); renderStatus(); },   // đặt lại bộ đếm "Đã nhận N ván" (không đụng bộ nhớ chống trùng)
        plan, derive, // để debug trong console
    };
    renderStatus();
})();
