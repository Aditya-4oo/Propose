/* ============================================================================
   FOREVER — proposal page logic
   Organized in sections:
     1. Canvas engine (stars, turtle-drawn heart, floating hearts, sparkles,
        shooting stars, fireworks, confetti)
     2. Generative ambient music (Web Audio API — no external file needed)
     3. Login gate
     4. Sequence control (start -> heart draw -> typewriter -> buttons)
     5. Yes / No button behaviour
   ============================================================================ */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     0. SHARED STATE
  --------------------------------------------------------------------- */
  const canvas = document.getElementById("scene-canvas");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildHeartPath();     // heart geometry depends on canvas size
  }
  window.addEventListener("resize", resize);

  const state = {
    started: false,
    heartPhase: "idle",     // idle -> drawing -> beating -> fast
    heartProgress: 0,       // 0..1 how much of the outline is drawn
    heartDrawStart: 0,
    beatSpeed: 1,           // multiplier, increases after "Yes"
    stars: [],
    sparkles: [],
    floatingHearts: [],
    shootingStars: [],
    fireworks: [],
    confetti: [],
    heartPoints: []
  };

  /* ---------------------------------------------------------------------
     1a. STARFIELD — thousands of tiny glowing particles fading in
  --------------------------------------------------------------------- */
  function makeStars() {
    const count = Math.floor((W * H) / 1800); // scales with screen, capped for 60fps
    state.stars = [];
    for (let i = 0; i < count; i++) {
      state.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        baseAlpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        phase: Math.random() * Math.PI * 2,
        appearAt: Math.random() * 2200 // ms delay before each star fades in
      });
    }
  }

  function drawStars(elapsed) {
    for (const s of state.stars) {
      if (elapsed < s.appearAt) continue;
      const fadeIn = Math.min(1, (elapsed - s.appearAt) / 800);
      const twinkle = 0.6 + 0.4 * Math.sin(elapsed * s.twinkleSpeed + s.phase);
      ctx.globalAlpha = s.baseAlpha * twinkle * fadeIn;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------------
     1b. TURTLE-STYLE NEON HEART
     Parametric heart curve, revealed point-by-point like a pen drawing it.
  --------------------------------------------------------------------- */
  function buildHeartPath() {
    const pts = [];
    const totalPoints = 480;
    const scale = Math.min(W, H) * 0.016; // responsive scale
    const cx = W / 2;
    const cy = H * 0.34;
    for (let i = 0; i <= totalPoints; i++) {
      const t = (i / totalPoints) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push({ x: cx + x * scale, y: cy - y * scale }); // flip y for canvas
    }
    state.heartPoints = pts;
  }

  function drawHeart(elapsed) {
    const pts = state.heartPoints;
    if (!pts.length) return;

    let upTo = pts.length;
    let scalePulse = 1;

    if (state.heartPhase === "drawing") {
      const drawDurationMs = 3400;
      const t = Math.min(1, (elapsed - state.heartDrawStart) / drawDurationMs);
      state.heartProgress = t;
      upTo = Math.max(2, Math.floor(t * pts.length));
      if (t >= 1) {
        state.heartPhase = "beating";
        onHeartFullyDrawn();
      }
    } else if (state.heartPhase === "beating" || state.heartPhase === "fast") {
      const speed = state.heartPhase === "fast" ? 0.008 : 0.0035;
      scalePulse = 1 + Math.sin(elapsed * speed) * 0.045 * (state.heartPhase === "fast" ? 1.6 : 1);
    }

    const cx = W / 2, cy = H * 0.34;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scalePulse, scalePulse);
    ctx.translate(-cx, -cy);

    // glow strokes: draw twice, wide soft glow + crisp core line
    ctx.beginPath();
    for (let i = 0; i < upTo; i++) {
      const p = pts[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    const grad = ctx.createLinearGradient(cx - 100, cy - 100, cx + 100, cy + 100);
    grad.addColorStop(0, "#ff2f92");
    grad.addColorStop(1, "#a259ff");

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.shadowColor = "rgba(255,47,146,0.9)";
    ctx.shadowBlur = 26;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.2;
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();

    // the drawing "pen tip" spark while still in progress
    if (state.heartPhase === "drawing" && upTo < pts.length) {
      const tip = pts[upTo - 1];
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function onHeartFullyDrawn() {
    // reveal the typewriter message once the heart is complete
    const card = document.getElementById("message-card");
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add("visible"));
    startTypewriter();
  }

  /* ---------------------------------------------------------------------
     1c. FLOATING HEARTS + SPARKLES (ambient, and the flood after "Yes")
  --------------------------------------------------------------------- */
  function spawnFloatingHeart(burst = false) {
    state.floatingHearts.push({
      x: Math.random() * W,
      y: H + 20,
      size: Math.random() * 18 + (burst ? 10 : 8),
      speed: Math.random() * 1.4 + (burst ? 1.6 : 0.5),
      drift: (Math.random() - 0.5) * 1.2,
      sway: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.5 + 0.4,
      hue: Math.random() < 0.5 ? "#ff2f92" : "#a259ff"
    });
  }

  function spawnSparkle() {
    state.sparkles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      life: 0,
      maxLife: Math.random() * 60 + 40,
      size: Math.random() * 2 + 0.6
    });
  }

  function updateAndDrawFloatingHearts(dt) {
    for (let i = state.floatingHearts.length - 1; i >= 0; i--) {
      const h = state.floatingHearts[i];
      h.y -= h.speed;
      h.sway += 0.03;
      h.x += Math.sin(h.sway) * 0.6 + h.drift * 0.2;
      if (h.y < -30) { state.floatingHearts.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = h.alpha;
      ctx.font = `${h.size}px serif`;
      ctx.shadowColor = h.hue;
      ctx.shadowBlur = 12;
      ctx.fillStyle = h.hue;
      ctx.fillText("❤", h.x, h.y);
      ctx.restore();
    }
  }

  function updateAndDrawSparkles() {
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      const s = state.sparkles[i];
      s.life++;
      if (s.life > s.maxLife) { state.sparkles.splice(i, 1); continue; }
      const p = s.life / s.maxLife;
      const alpha = Math.sin(p * Math.PI);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffe6f5";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
     1d. SHOOTING STARS
  --------------------------------------------------------------------- */
  function maybeSpawnShootingStar() {
    if (Math.random() < 0.004) {
      state.shootingStars.push({
        x: Math.random() * W * 0.6,
        y: Math.random() * H * 0.3,
        vx: 7 + Math.random() * 5,
        vy: 3 + Math.random() * 2,
        life: 0,
        maxLife: 40
      });
    }
  }
  function updateAndDrawShootingStars() {
    for (let i = state.shootingStars.length - 1; i >= 0; i--) {
      const s = state.shootingStars[i];
      s.x += s.vx; s.y += s.vy; s.life++;
      if (s.life > s.maxLife) { state.shootingStars.splice(i, 1); continue; }
      const alpha = 1 - s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "#a259ff";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 4, s.y - s.vy * 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
     1e. FIREWORKS + CONFETTI (triggered on "Yes")
  --------------------------------------------------------------------- */
  function spawnFirework(x, y) {
    const particles = [];
    const count = 46;
    const colors = ["#ff2f92", "#a259ff", "#ffd66b", "#ffffff", "#ff6fb5"];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 40 + 40,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    state.fireworks.push(particles);
  }

  function updateAndDrawFireworks() {
    for (let f = state.fireworks.length - 1; f >= 0; f--) {
      const particles = state.fireworks[f];
      let alive = false;
      for (const p of particles) {
        if (p.life > p.maxLife) continue;
        alive = true;
        p.vy += 0.04; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        const alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(alpha, 0);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (!alive) state.fireworks.splice(f, 1);
    }
  }

  function spawnConfettiBurst() {
    const colors = ["#ff2f92", "#a259ff", "#ffd66b", "#ffffff"];
    for (let i = 0; i < 140; i++) {
      state.confetti.push({
        x: Math.random() * W,
        y: -20 - Math.random() * H * 0.3,
        w: Math.random() * 6 + 4,
        h: Math.random() * 10 + 6,
        vy: Math.random() * 2 + 2,
        vx: (Math.random() - 0.5) * 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0,
        maxLife: 260
      });
    }
  }
  function updateAndDrawConfetti() {
    for (let i = state.confetti.length - 1; i >= 0; i--) {
      const c = state.confetti[i];
      c.x += c.vx; c.y += c.vy; c.rot += c.vr; c.life++;
      if (c.life > c.maxLife || c.y > H + 20) { state.confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
     1f. MAIN RENDER LOOP
  --------------------------------------------------------------------- */
  let lastFrame = performance.now();
  let sequenceStart = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = now - lastFrame;
    lastFrame = now;
    if (!state.started) return;

    const elapsed = now - sequenceStart;

    // trail-fade clear (keeps things smooth rather than a hard clear)
    ctx.clearRect(0, 0, W, H);

    drawStars(elapsed);
    updateAndDrawSparkles();
    updateAndDrawShootingStars();
    maybeSpawnShootingStar();

    if (Math.random() < 0.04) spawnSparkle();
    if (Math.random() < (state.heartPhase === "fast" ? 0.35 : 0.08)) spawnFloatingHeart();

    drawHeart(elapsed);
    updateAndDrawFloatingHearts(dt);
    updateAndDrawFireworks();
    updateAndDrawConfetti();
  }
  requestAnimationFrame(loop);

  /* ---------------------------------------------------------------------
     2. GENERATIVE AMBIENT MUSIC (Web Audio API)
     A soft, slowly-shifting pad so the moment has music without needing
     an external audio file (network in this environment can't fetch one).
  --------------------------------------------------------------------- */
  let audioCtx = null, musicGain = null, musicNodes = [];
  let musicOn = false;
  const backgroundMusic = document.getElementById("background-music");
  backgroundMusic.volume = 0.45;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.0001;
    musicGain.connect(audioCtx.destination);

    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.connect(musicGain);

    // a gentle chord built from soft detuned sine/triangle oscillators
    const notes = [261.63, 329.63, 392.0, 523.25]; // C major-ish, warm
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;

      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.08 + i * 0.02;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 2.2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const voiceGain = audioCtx.createGain();
      voiceGain.gain.value = 0.06 / (i + 1);

      osc.connect(voiceGain);
      voiceGain.connect(filter);
      osc.start();
      lfo.start();
      musicNodes.push(osc, lfo);
    });

    // slow swell so it never feels static
    const swell = audioCtx.createOscillator();
    swell.frequency.value = 0.05;
    const swellGain = audioCtx.createGain();
    swellGain.gain.value = 200;
    swell.connect(swellGain);
    swellGain.connect(filter.frequency);
    swell.start();
    musicNodes.push(swell);
  }

  function playMusic() {
    backgroundMusic.play().catch(() => {
      // The Start button is a user action, so browsers normally permit playback.
      // If a browser blocks it, the music button lets the visitor try again.
    });
    musicOn = true;
    document.getElementById("music-icon").textContent = "🎵";
  }
  function pauseMusic() {
    backgroundMusic.pause();
    musicOn = false;
    document.getElementById("music-icon").textContent = "🔇";
  }

  document.getElementById("music-btn").addEventListener("click", () => {
    if (musicOn) pauseMusic(); else playMusic();
  });

  /* ---------------------------------------------------------------------
     3. LOGIN GATE
  --------------------------------------------------------------------- */
  const gateForm = document.getElementById("gate-form");
  const gateScreen = document.getElementById("gate-screen");
  const gateError = document.getElementById("gate-error");
  const retryBtn = document.getElementById("retry-btn");
  const startScreen = document.getElementById("start-screen");

  const SECRET = {
    name: "riya",
    code: "mango",
    pass: "love you"
  };

  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("in-name").value.trim().toLowerCase();
    const code = document.getElementById("in-code").value.trim().toLowerCase();
    const pass = document.getElementById("in-pass").value.trim().toLowerCase();

    const correct = name === SECRET.name && code === SECRET.code && pass === SECRET.pass;

    if (correct) {
      unlockGate();
    } else {
      gateError.hidden = false;
      retryBtn.hidden = false;
      gateForm.querySelector(".btn-primary").hidden = true;
      gateScreen.querySelector(".gate-card").style.animation = "shake 0.4s";
    }
  });

  retryBtn.addEventListener("click", () => {
    gateError.hidden = true;
    retryBtn.hidden = true;
    gateForm.reset();
    gateForm.querySelector(".btn-primary").hidden = false;
    gateScreen.querySelector(".gate-card").style.animation = "";
  });

  function unlockGate() {
    const card = gateScreen.querySelector(".gate-card");
    card.style.transition = "transform 0.7s ease, opacity 0.7s ease";
    card.style.transform = "scale(0.92) rotateX(12deg)";
    card.style.opacity = "0";
    gateScreen.style.opacity = "0";
    setTimeout(() => {
      gateScreen.hidden = true;
      startScreen.hidden = false;
      requestAnimationFrame(() => (startScreen.style.opacity = "1"));
    }, 650);
  }

  /* ---------------------------------------------------------------------
     4. SEQUENCE CONTROL — Start button kicks off the whole show
  --------------------------------------------------------------------- */
  const stageScreen = document.getElementById("stage-screen");
  const musicBtn = document.getElementById("music-btn");

  document.getElementById("start-btn").addEventListener("click", () => {
    startScreen.style.opacity = "0";
    setTimeout(() => { startScreen.hidden = true; }, 500);

    stageScreen.hidden = false;
    musicBtn.hidden = false;
    playMusic();

    resize();       // ensure canvas + heart geometry match current viewport
    makeStars();
    state.started = true;
    sequenceStart = performance.now();
    state.heartPhase = "drawing";
    state.heartDrawStart = 0; // relative to sequenceStart, i.e. elapsed 0

    // a gentle ambient drift of floating hearts throughout
    setInterval(() => { if (state.started) spawnFloatingHeart(false); }, 900);
  });

  /* ---------------------------------------------------------------------
     4b. TYPEWRITER
  --------------------------------------------------------------------- */
  const MESSAGE =
    "Every heartbeat reminds me of you.\n" +
    "Every moment with you is my favourite memory.\n" +
    "Will you make every tomorrow beautiful?\n" +
    "❤️ Riya, will you be mine forever? ❤️";

  function startTypewriter() {
    const el = document.getElementById("typewriter");
    el.textContent = "";
    let i = 0;
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "\u00A0";

    function tick() {
      if (i < MESSAGE.length) {
        el.textContent = MESSAGE.slice(0, i + 1);
        el.appendChild(cursor);
        i++;
        const char = MESSAGE[i - 1];
        const delay = char === "\n" ? 420 : char === "." || char === "?" ? 260 : 34;
        setTimeout(tick, delay);
      } else {
        // reveal the decision buttons once the letter is fully typed
        setTimeout(() => {
          const row = document.getElementById("decision-row");
          row.hidden = false;
          row.style.animation = "fadeUp 0.6s ease forwards";
        }, 500);
      }
    }
    tick();
  }

  /* ---------------------------------------------------------------------
     5. YES / NO BEHAVIOUR
  --------------------------------------------------------------------- */
  const yesBtn = document.getElementById("yes-btn");
  const noBtn = document.getElementById("no-btn");
  const decisionRow = document.getElementById("decision-row");
  const noTaunt = document.getElementById("no-taunt");
  const celebration = document.getElementById("celebration");
  const finalLine = document.getElementById("final-line");
  const balloonField = document.getElementById("balloon-field");
  let approved = false;

  const TAUNTS = [
    "Are you sure? 🥺",
    "Think again ❤️",
    "Give me one more chance 💖",
    "Please don't break my heart 😭"
  ];
  let tauntIndex = 0;

  function runAway() {
    const bounds = decisionRow.getBoundingClientRect();
    const parentBounds = decisionRow.parentElement.getBoundingClientRect();
    const maxX = parentBounds.width - bounds.width * 0.4;
    const maxY = 60;
    const nx = (Math.random() - 0.5) * Math.min(maxX, 220);
    const ny = (Math.random() - 0.5) * maxY;
    noBtn.style.position = "relative";
    noBtn.style.left = nx + "px";
    noBtn.style.top = ny + "px";

    noTaunt.textContent = TAUNTS[tauntIndex % TAUNTS.length];
    tauntIndex++;
  }

  // desktop: dodge on hover proximity; also dodge on click as a fallback for touch
  noBtn.addEventListener("mouseenter", runAway);
  noBtn.addEventListener("click", (e) => {
    e.preventDefault();
    runAway();
  });
  noBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    runAway();
  }, { passive: false });

  yesBtn.addEventListener("click", () => {
    if (approved) return;
    approved = true;
    // heart beats faster
    state.heartPhase = "fast";

    // fireworks behind the heart
    const cx = W / 2, cy = H * 0.34;
    let bursts = 0;
    const fireworkTimer = setInterval(() => {
      spawnFirework(
        cx + (Math.random() - 0.5) * W * 0.5,
        cy + (Math.random() - 0.5) * H * 0.25
      );
      bursts++;
      if (bursts > 10) clearInterval(fireworkTimer);
    }, 260);

    // confetti
    spawnConfettiBurst();
    setTimeout(spawnConfettiBurst, 900);

    // A first wave of balloons makes the approval feel immediately celebratory.
    launchBalloons(12);

    // hundreds of floating hearts fill the screen
    for (let i = 0; i < 220; i++) {
      setTimeout(() => spawnFloatingHeart(true), i * 12);
    }

    // hide the question, show celebration copy
    decisionRow.style.transition = "opacity 0.4s ease";
    decisionRow.style.opacity = "0";
    noTaunt.style.opacity = "0";
    setTimeout(() => {
      decisionRow.hidden = true;
      celebration.hidden = false;
      celebration.style.animation = "fadeUp 0.7s ease forwards";
    }, 400);

    // final line + balloons after the countdown line has had its moment
    setTimeout(() => {
      finalLine.hidden = false;
      finalLine.style.animation = "fadeUp 0.8s ease forwards";
      launchBalloons(18);
    }, 2600);
  });

  function launchBalloons(count = 18) {
    const colors = ["#ff2f92", "#a259ff", "#ff6fb5", "#ffd66b", "#ffffff"];
    for (let i = 0; i < count; i++) {
      const b = document.createElement("div");
      b.className = "balloon";
      const left = Math.random() * 100;
      const duration = 9 + Math.random() * 6;
      const delay = Math.random() * 4;
      const sway = (Math.random() - 0.5) * 160;
      b.style.left = left + "vw";
      b.style.background = `linear-gradient(160deg, ${colors[i % colors.length]}, rgba(255,255,255,0.15))`;
      b.style.animationDuration = duration + "s";
      b.style.animationDelay = delay + "s";
      b.style.setProperty("--sway", sway + "px");
      balloonField.appendChild(b);
    }

    // Remove old decorative elements after their animation, so repeated use
    // never leaves unnecessary nodes in the page.
    setTimeout(() => {
      balloonField.replaceChildren();
    }, 20000);
  }

  /* ---------------------------------------------------------------------
     Rose petals — lightweight ambient DOM layer
  --------------------------------------------------------------------- */
  function spawnPetals() {
    const field = document.getElementById("petal-field");
    const petalCount = window.innerWidth < 600 ? 10 : 18;
    for (let i = 0; i < petalCount; i++) {
      const p = document.createElement("div");
      p.className = "petal";
      p.textContent = "❀";
      p.style.left = Math.random() * 100 + "vw";
      p.style.color = Math.random() < 0.5 ? "#ff6fb5" : "#c98bff";
      p.style.animationDuration = 10 + Math.random() * 12 + "s";
      p.style.animationDelay = Math.random() * 12 + "s";
      p.style.setProperty("--drift", (Math.random() - 0.5) * 160 + "px");
      field.appendChild(p);
    }
  }

  /* ---------------------------------------------------------------------
     Small extra keyframes injected once (fadeUp / shake), keeps style.css
     focused on the primary design system.
  --------------------------------------------------------------------- */
  const extraStyle = document.createElement("style");
  extraStyle.textContent = `
    @keyframes fadeUp { from { opacity:0; transform: translateY(14px);} to { opacity:1; transform: translateY(0);} }
    @keyframes shake { 0%,100%{transform:translateX(0);} 20%{transform:translateX(-8px);} 40%{transform:translateX(8px);} 60%{transform:translateX(-6px);} 80%{transform:translateX(6px);} }
    #message-card.visible { animation: fadeUp 0.7s ease forwards; }
  `;
  document.head.appendChild(extraStyle);

  /* ---------------------------------------------------------------------
     INIT
  --------------------------------------------------------------------- */
  resize();
  spawnPetals();
})();
