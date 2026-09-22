(function(){
  "use strict";
  var PHONE = "tel:+15308850508";

  /* Mobile menu */
  var mb = document.getElementById("menuBtn"), menu = document.getElementById("menu");
  if (mb && menu) mb.addEventListener("click", function(){
    var on = !menu.classList.contains("open");
    menu.classList.toggle("open", on);
    mb.setAttribute("aria-expanded", String(on));
  });

  /* Sticky call bar — one motion, after first scroll */
  var bar = document.getElementById("callbar"), ticking = false;
  function onScroll(){
    if (ticking || !bar) return;
    ticking = true;
    window.requestAnimationFrame(function(){ bar.classList.toggle("up", window.scrollY > 400); ticking = false; });
  }
  window.addEventListener("scroll", onScroll, {passive:true});
  onScroll();

  /* Open/closed reads the real clock. Hours from facts.json: Mon–Fri 8–5. */
  (function(){
    var h = document.getElementById("hours"); if (!h || !bar) return;
    var d = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Los_Angeles"})), day = d.getDay(), hr = d.getHours();
    var open = day >= 1 && day <= 5 && hr >= 8 && hr < 17;
    if (!open) {
      h.textContent = "Closed now · opens Mon–Fri 8am";
      bar.querySelector(".status b").innerHTML = '<span class="dot" aria-hidden="true"></span>Leave a message, we call back';
    }
  })();

  /* Single fade-up reveal */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } }); }, {rootMargin:"0px 0px -10% 0px"});
    document.querySelectorAll(".reveal").forEach(function(el){ io.observe(el); });
  } else { document.querySelectorAll(".reveal").forEach(function(el){ el.classList.add("in"); }); }

  /* Three-question form.
     DEMO MODE: data-demo="true" shows the success screen and delivers NOWHERE.
     Go-live: replace the block marked INTEGRATION POINT with a POST to the GHL
     form webhook, and switch data-demo to "false". Until then, leads do not arrive. */
  var form = document.getElementById("lead");
  if (form) {
    var steps = ["q1","q2","q3"].map(function(id){ return document.getElementById(id); });
    var errs  = ["e1","e2","e3"].map(function(id){ return document.getElementById(id); });
    var i = 0, next = document.getElementById("next"), back = document.getElementById("back"),
        counter = document.getElementById("counter"), done = document.getElementById("done");
    function valid(n){
      if (n === 0) return !!form.querySelector('input[name="issue"]:checked');
      if (n === 1) return !!form.querySelector('input[name="when"]:checked');
      return form.name.value.trim().length > 1 && form.phone.value.replace(/\D/g,"").length >= 10;
    }
    function render(){
      steps.forEach(function(s, n){ s.hidden = n !== i; });
      errs.forEach(function(e){ e.hidden = true; });
      counter.textContent = "Question " + (i + 1) + " of 3";
      back.hidden = i === 0;
      next.textContent = i === 2 ? "Send it" : "Continue";
      var first = steps[i].querySelector("input"); if (first) first.focus({preventScroll:true});
    }
    next.addEventListener("click", function(){
      if (!valid(i)) { errs[i].hidden = false; return; }
      if (i < 2) { i++; render(); return; }
      /* INTEGRATION POINT — POST to GHL webhook here. Fire the auto-reply on submit. */
      if (form.dataset.demo === "true") { form.hidden = true; done.hidden = false; }
      else {
        var WEBHOOK = form.dataset.webhook; if (!WEBHOOK) { errs[2].hidden = false; errs[2].textContent = "Form isn't connected. Please call (530) 885-0508."; return; }
        fetch(WEBHOOK, {method:"POST", body:new FormData(form)}).then(function(r){ if(!r.ok) throw 0; form.hidden = true; done.hidden = false; })
          .catch(function(){ errs[2].hidden = false; errs[2].textContent = "That didn't send. Please call (530) 885-0508."; });
        return;
      }
      });
    back.addEventListener("click", function(){ if (i > 0) { i--; render(); } });
    render();
  }

  /* Text chat placeholder — open/close only. Real chat arrives with the GHL widget. */
  var co = document.getElementById("chatOpen"), cp = document.getElementById("chatPanel"), cc = document.getElementById("chatClose");
  if (co && cp && cc) {
    function setChat(on){ cp.hidden = !on; co.hidden = on; co.setAttribute("aria-expanded", String(on)); (on ? cc : co).focus(); }
    co.addEventListener("click", function(){ setChat(true); });
    cc.addEventListener("click", function(){ setChat(false); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !cp.hidden) setChat(false); });
  }
})();
