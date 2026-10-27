/* R & J Automotive — homepage motion. Plain JS, no libraries.
   Everything respects prefers-reduced-motion and the "Pause motion" button. */
(function(){
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var body = document.body;
  var still = reduce;
  try { if (localStorage.getItem("rj-still") === "1") still = true; } catch(e){}
  var vids = [].slice.call(document.querySelectorAll("video.lazy-vid"));

  /* ---------- Pause motion ---------- */
  var mt = document.getElementById("motionToggle");
  function applyStill(){
    body.classList.toggle("still", still);
    if (mt){ mt.setAttribute("aria-pressed", String(still)); mt.textContent = still ? "Play motion" : "Pause motion"; }
    vids.forEach(function(v){ if (still) v.pause(); else if (v.dataset.visible === "1" && wantsPlay(v)) safePlay(v); });
  }
  if (mt) mt.addEventListener("click", function(){
    still = !still;
    try { localStorage.setItem("rj-still", still ? "1" : "0"); } catch(e){}
    applyStill();
  });
  /* Each section video is a looping montage: its own clip, then a clip of Steve, then back to its first frame. */
  function safePlay(v){ var p = v.play(); if (p && p.catch) p.catch(function(){}); }

  /* ---------- Hero: logo intro, then the words ---------- */
  var hero = document.querySelector(".hero-live"), mark = document.getElementById("heroMark");
  function ready(){ if (hero) hero.classList.add("ready"); }
  if (still || !mark) { ready(); }
  else {
    var shown = false, show = function(){ if (!shown){ shown = true; ready(); } };
    var p = mark.play();
    if (p && p.catch) p.catch(show);
    setTimeout(show, 2800);
  }

  /* ---------- Headings rise word by word ---------- */
  document.querySelectorAll(".rise").forEach(function(h){
    var words = h.textContent.trim().split(/\s+/);
    h.setAttribute("aria-label", h.textContent.trim());
    h.innerHTML = words.map(function(w, i){ return '<span class="w" aria-hidden="true" style="transition-delay:' + (i * 60) + 'ms">' + w + '</span>'; }).join(" ");
  });

  /* ---------- One observer for reveals, headings, counters ---------- */
  function countUp(el){
    var to = parseFloat(el.dataset.count), from = parseFloat(el.dataset.from || "0"), dec = parseInt(el.dataset.dec || "0", 10), suf = el.dataset.suffix || "";
    if (still) { el.textContent = to.toFixed(dec) + suf; return; }
    var t0 = null, dur = 1400;
    function step(t){
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (from + (to - from) * e).toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        e.target.querySelectorAll("[data-count]").forEach(countUp);
        io.unobserve(e.target);
      });
    }, {rootMargin:"0px 0px -12% 0px"});
    document.querySelectorAll(".rise, .counters li").forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll(".rise").forEach(function(el){ el.classList.add("in"); });
  }

  /* ---------- Videos load and play only while on screen ---------- */
  var storyVids = [].slice.call(document.querySelectorAll(".frame video"));
  function wantsPlay(v){ return storyVids.indexOf(v) === -1 || v.classList.contains("on"); }
  function load(v){ if (!v.src && v.dataset.src){ v.src = v.dataset.src; v.load(); } }
  if ("IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function(es){
      es.forEach(function(e){
        var v = e.target;
        v.dataset.visible = e.isIntersecting ? "1" : "0";
        if (e.isIntersecting){ load(v); if (!still && wantsPlay(v)) safePlay(v); }
        else v.pause();
      });
    }, {rootMargin:"200px 0px"});
    vids.forEach(function(v){ vio.observe(v); });
  }

  /* ---------- Story: footage swaps as each part scrolls into the middle ---------- */
  var cards = [].slice.call(document.querySelectorAll(".step-card"));
  function setStory(i){
    cards.forEach(function(c, n){ c.classList.toggle("active", n === i); });
    storyVids.forEach(function(v, n){
      var on = n === i;
      v.classList.toggle("on", on);
      if (on){ load(v); if (!still && v.dataset.visible !== "0") safePlay(v); } else v.pause();
    });
  }
  if (cards.length && "IntersectionObserver" in window) {
    var sio = new IntersectionObserver(function(es){
      es.forEach(function(e){ if (e.isIntersecting) setStory(parseInt(e.target.dataset.i, 10)); });
    }, {rootMargin:"-45% 0px -45% 0px"});
    cards.forEach(function(c){ sio.observe(c); });
    setStory(0);
  }

  /* ---------- Services: pin and glide sideways (desktop, motion on) ---------- */
  var hs = document.querySelector(".hscroll"), track = document.getElementById("track"), pin = hs && hs.querySelector(".hscroll-pin");
  var hsOn = false, travel = 0, hdrH = 72, hdr = document.getElementById("hdr");
  function sizeHS(){
    var want = window.innerWidth >= 900 && !reduce;
    hs.classList.toggle("pinned", want);
    hsOn = want;
    if (!want){ hs.style.height = ""; track.style.transform = ""; return; }
    hdrH = hdr ? hdr.offsetHeight : 72;
    document.documentElement.style.setProperty("--hdr", hdrH + "px");
    travel = Math.max(0, track.scrollWidth - window.innerWidth + 120);
    hs.style.height = (window.innerHeight - hdrH + travel) + "px";
  }
  function moveHS(){
    if (!hsOn) return;
    var r = hs.getBoundingClientRect();
    var k = Math.min(1, Math.max(0, (hdrH - r.top) / (travel || 1)));
    track.style.transform = "translate3d(" + (-travel * k).toFixed(1) + "px,0,0)";
  }
  if (hs && track) { sizeHS(); window.addEventListener("resize", function(){ sizeHS(); moveHS(); }); }

  /* ---------- Reviews ribbon: double the cards for a seamless loop; only drifts while on screen ---------- */
  document.querySelectorAll(".m-track").forEach(function(t){ t.innerHTML += t.innerHTML; });
  if ("IntersectionObserver" in window) {
    var oio = new IntersectionObserver(function(es){ es.forEach(function(e){ e.target.classList.toggle("onscreen", e.isIntersecting); }); });
    document.querySelectorAll(".reviews-live, .hscroll").forEach(function(el){ oio.observe(el); });
  }
  var rv = document.querySelector(".reviews-live"), rt = document.getElementById("marqueeToggle");
  if (rt && rv) rt.addEventListener("click", function(){
    var p = !rv.classList.contains("paused");
    rv.classList.toggle("paused", p);
    rt.setAttribute("aria-pressed", String(p));
    rt.textContent = p ? "Play reviews" : "Pause reviews";
  });

  /* ---------- Scroll: progress bar, hero drift, sideways track ---------- */
  var bar = document.getElementById("progress"), pic = document.querySelector(".hero-bg picture"), tick = false;
  function onScroll(){
    if (tick) return; tick = true;
    requestAnimationFrame(function(){
      var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = "scaleX(" + (max > 0 ? y / max : 0).toFixed(4) + ")";
      if (pic && !still && y < window.innerHeight * 1.2) pic.style.transform = "translate3d(0," + (y * 0.28).toFixed(1) + "px,0)";
      moveHS();
      tick = false;
    });
  }
  window.addEventListener("scroll", onScroll, {passive:true});
  onScroll();
  applyStill();
})();

/* Contact page: the Google map loads only when the visitor asks for it. */
(function(){
  var b = document.getElementById("loadMap"), card = document.getElementById("mapCard");
  if (!b || !card) return;
  b.addEventListener("click", function(){
    card.innerHTML = '<iframe title="Map: R & J Automotive, 475 Grass Valley Hwy, Auburn, CA" src="https://www.google.com/maps?q=R+%26+J+Automotive,+475+Grass+Valley+Hwy,+Auburn,+CA+95603&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>';
  });
})();

/* Straight talk: the scan-tool readout types itself once it's on screen (Terminal template). */
(function(){
  var pre = document.getElementById("scanText");
  if (!pre) return;
  var lines = pre.getAttribute("data-lines").split("|");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("still");
  function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
  function paint(done, partial){
    var html = done.map(function(l){ return /^  /.test(l) || /status/.test(l) ? '<span class="ok">' + esc(l) + "</span>" : esc(l); }).join("\n");
    pre.innerHTML = html + (partial !== undefined ? (done.length ? "\n" : "") + esc(partial) : "") + '<span class="caret"> </span>';
  }
  if (still) { paint(lines); return; }
  var started = false;
  function run(){
    if (started) return; started = true;
    var done = [], li = 0, ci = 0;
    (function tick(){
      if (li >= lines.length) { paint(done); return; }
      var l = lines[li];
      if (ci <= l.length) { paint(done, l.slice(0, ci)); ci++; setTimeout(tick, 26); }
      else { done.push(l); li++; ci = 0; setTimeout(tick, 420); }
    })();
  }
  paint([]);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function(es, o){ if (es[0].isIntersecting) { run(); o.disconnect(); } }).observe(pre);
  } else run();
})();
