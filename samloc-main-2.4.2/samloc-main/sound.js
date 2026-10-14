/* ══════════════════════════════════════════════════════════════
   sound.js — Sâm Lốc · Sound Effects (Web Audio API)
══════════════════════════════════════════════════════════════ */

const SFX = (() => {
    let ctx = null;
    let enabled = true;

    const LS_SOUND = 'xamloc_sound';

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function loadEnabled() {
        const v = localStorage.getItem(LS_SOUND);
        enabled = v === null ? true : v === '1';
    }

    function saveEnabled() {
        localStorage.setItem(LS_SOUND, enabled ? '1' : '0');
    }

    function toggle() {
        enabled = !enabled;
        saveEnabled();
        updateSoundBtn();
        if (enabled) play('click');
    }

    function updateSoundBtn() {
        const btn = document.getElementById('sound-toggle-btn');
        const icon = document.getElementById('sound-icon');
        if (btn && icon) {
            icon.textContent = enabled ? '🔊' : '🔇';
            btn.title = enabled ? 'Tắt âm thanh' : 'Bật âm thanh';
        }
    }

    // ── Low-level synth helpers ──────────────────────────────────
    function osc(freq, type, start, dur, gain, ctx) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(gain, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(start);
        o.stop(start + dur);
    }

    function noise(start, dur, gain, ctx) {
        const bufSize = ctx.sampleRate * dur;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        src.connect(g);
        g.connect(ctx.destination);
        src.start(start);
        src.stop(start + dur);
    }

    // ── Sound library ────────────────────────────────────────────
    const sounds = {

        // Bấm nút thông thường — click nhẹ
        click() {
            const c = getCtx(), t = c.currentTime;
            osc(1200, 'sine', t, 0.06, 0.15, c);
            osc(800, 'sine', t + 0.02, 0.05, 0.08, c);
        },

        // Chọn người chơi / picker
        pick() {
            const c = getCtx(), t = c.currentTime;
            osc(600, 'triangle', t, 0.08, 0.18, c);
            osc(900, 'sine', t + 0.04, 0.06, 0.10, c);
        },

        // Thêm ván thành công — fanfare ngắn
        success() {
            const c = getCtx(), t = c.currentTime;
            const melody = [523, 659, 784, 1047];
            melody.forEach((f, i) => {
                osc(f, 'triangle', t + i * 0.09, 0.18, 0.22, c);
            });
            osc(523, 'sine', t, 0.35, 0.08, c);
        },

        // Báo sâm — âm huyền bí
        xam() {
            const c = getCtx(), t = c.currentTime;
            osc(220, 'sawtooth', t, 0.4, 0.12, c);
            osc(330, 'sine', t + 0.05, 0.35, 0.15, c);
            osc(440, 'triangle', t + 0.15, 0.25, 0.18, c);
            osc(660, 'sine', t + 0.25, 0.2, 0.12, c);
        },

        // Sâm thành công — triumph!
        xamWin() {
            const c = getCtx(), t = c.currentTime;
            [392, 523, 659, 784, 1047].forEach((f, i) => {
                osc(f, 'triangle', t + i * 0.07, 0.22, 0.25 - i * 0.02, c);
                osc(f * 2, 'sine', t + i * 0.07, 0.15, 0.08, c);
            });
        },

        // Sâm bị chặn — thảm bại
        xamLose() {
            const c = getCtx(), t = c.currentTime;
            osc(400, 'sawtooth', t, 0.12, 0.2, c);
            osc(300, 'sawtooth', t + 0.1, 0.15, 0.18, c);
            osc(200, 'sawtooth', t + 0.22, 0.25, 0.22, c);
        },

        // Tứ quý — tiếng bùng nổ
        tuquy() {
            const c = getCtx(), t = c.currentTime;
            noise(t, 0.08, 0.35, c);
            osc(150, 'sawtooth', t, 0.18, 0.3, c);
            osc(300, 'square', t + 0.06, 0.14, 0.2, c);
            osc(600, 'triangle', t + 0.1, 0.12, 0.25, c);
            osc(900, 'sine', t + 0.12, 0.15, 0.18, c);
        },

        // Cháy bài — tiếng lửa
        chay() {
            const c = getCtx(), t = c.currentTime;
            noise(t, 0.25, 0.28, c);
            osc(80, 'sawtooth', t, 0.3, 0.2, c);
            osc(160, 'sawtooth', t + 0.05, 0.25, 0.15, c);
        },

        // Xóa ván — tiếng xóa
        del() {
            const c = getCtx(), t = c.currentTime;
            osc(600, 'sawtooth', t, 0.05, 0.18, c);
            osc(300, 'sawtooth', t + 0.05, 0.08, 0.18, c);
            osc(150, 'sawtooth', t + 0.1, 0.12, 0.18, c);
            noise(t + 0.05, 0.1, 0.12, c);
        },

        // Lưu thành công
        save() {
            const c = getCtx(), t = c.currentTime;
            osc(880, 'sine', t, 0.08, 0.2, c);
            osc(1109, 'sine', t + 0.07, 0.1, 0.2, c);
        },

        // Cảnh báo / lỗi
        warn() {
            const c = getCtx(), t = c.currentTime;
            osc(440, 'square', t, 0.1, 0.25, c);
            osc(440, 'square', t + 0.15, 0.1, 0.25, c);
        },

        // Chuyển trang
        nav() {
            const c = getCtx(), t = c.currentTime;
            osc(700, 'sine', t, 0.07, 0.12, c);
            osc(900, 'sine', t + 0.05, 0.06, 0.10, c);
        },

        // Đổi theme
        theme() {
            const c = getCtx(), t = c.currentTime;
            osc(500, 'triangle', t, 0.09, 0.14, c);
            osc(750, 'sine', t + 0.06, 0.08, 0.12, c);
        },

        // Hạng 1 — tiếng fanfare to
        rank1() {
            const c = getCtx(), t = c.currentTime;
            const notes = [523, 659, 784, 1047, 1319];
            notes.forEach((f, i) => {
                osc(f, 'triangle', t + i * 0.1, 0.25, 0.28 - i * 0.02, c);
                if (i < 3) osc(f / 2, 'sine', t + i * 0.1, 0.2, 0.1, c);
            });
        },

        // Đền làng
        denLang() {
            const c = getCtx(), t = c.currentTime;
            osc(330, 'triangle', t, 0.15, 0.2, c);
            osc(220, 'sawtooth', t + 0.1, 0.2, 0.18, c);
            osc(165, 'sine', t + 0.22, 0.2, 0.15, c);
        },
    };

    // ── Âm thanh từ file mp3: lưu ván thành công / thất bại ──
    // Nạp file vào Web Audio (cùng AudioContext với các tiếng khác) → không vướng chặn autoplay/Range của <audio>.
    const FILES = { saveOk: 'luuthanhcong.mp3', saveFail: 'luuthatbai.mp3' };
    const raw = {}, buffers = {};
    function fetchRaw() {
        Object.keys(FILES).forEach((n) => {
            fetch(FILES[n]).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
                .then((ab) => { raw[n] = ab; })
                .catch((e) => console.warn('[SFX] không tải được', FILES[n], e && e.message));
        });
    }
    function decode(n) {
        if (buffers[n] || !raw[n]) return Promise.resolve(buffers[n] || null);
        const c = getCtx(), ab = raw[n].slice(0);
        return new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); })
            .then((b) => { buffers[n] = b; return b; })
            .catch((e) => { console.warn('[SFX] không giải mã được', FILES[n], e && e.message); return null; });
    }
    function fallbackAudio(n) {
        try { const a = new Audio(FILES[n]); const pr = a.play(); if (pr && pr.catch) pr.catch((e) => console.warn('[SFX] trình duyệt chặn phát:', e && e.message)); } catch (e) { }
    }
    function playFile(n) {
        try {
            const c = getCtx();
            const go = (buf) => {
                if (!buf) { fallbackAudio(n); return; }
                const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination); src.start();
            };
            if (buffers[n]) go(buffers[n]); else decode(n).then(go);
        } catch (e) { fallbackAudio(n); }
    }
    // Sau lần chạm đầu tiên vào trang: mở khóa AudioContext và giải mã sẵn
    function unlockFiles() { try { getCtx(); Object.keys(FILES).forEach(decode); } catch (e) { } }

    function play(name) {
        if (!enabled) return;
        if (FILES[name]) { playFile(name); return; }
        try {
            sounds[name]?.();
        } catch (e) {
            // AudioContext chưa sẵn sàng, thử lại sau
            setTimeout(() => { try { sounds[name]?.(); } catch (e2) { } }, 100);
        }
    }

    // Init khi DOM sẵn sàng
    function init() {
        loadEnabled();
        updateSoundBtn();
        // Unlock AudioContext khi user tương tác lần đầu
        document.addEventListener('click', () => { try { getCtx(); } catch (e) { } }, { once: true });
        fetchRaw();
        ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, unlockFiles, { once: true, passive: true }));
    }

    return { play, toggle, init, isEnabled: () => enabled };
})();
