/**
 * Morning Park — API Proxy Worker
 * Deployed at: mparklab-api.tap-landside974.workers.dev
 *
 * Routes:
 *   POST /review-text   → streams a live review-request SMS (live generator demo)
 *   POST /mini-audit    → returns quick JSON audit snapshot
 *   POST /roi-audit     → returns full ROI breakdown from quiz inputs
 *
 * Env secrets required (set in Cloudflare dashboard → Settings → Variables):
 *   ANTHROPIC_API_KEY   → your Anthropic API key
 *
 * Rate limiting: 10 requests per IP per minute (via Cloudflare's built-in rate limiting)
 * CORS: locked to mparklab.com + localhost for local dev
 */

const ALLOWED_ORIGINS = ['https://mparklab.com', 'https://jdc-build.com', 'http://localhost:7824', 'http://127.0.0.1:7824', 'http://localhost:7825', 'http://127.0.0.1:7825'];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://mparklab.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const action = new URL(request.url).pathname.replace(/^\//, '');

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    try {
      if (action === 'review-text')  return reviewText(body, env, cors);
      if (action === 'mini-audit')   return miniAudit(body, env, cors);
      if (action === 'roi-audit')    return roiAudit(body, env, cors);
      if (action === 'chat')         return siteChat(body, env, cors);
      if (action === 'jdc-chat')     return siteChat(body, env, cors, JDC_CHAT_SYSTEM);
      return new Response('Not found', { status: 404, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};

// ─── ROUTE 0: Homepage assistant chat ────────────────────────────────────────
// The site sends the running message history; the system prompt lives here so
// it can't be tampered with client-side.
const CHAT_SYSTEM = "You are the Morning Park assistant, chatting on the homepage of Morning Park's website. Morning Park (founder: JP, aka Justin) builds custom AI automation and lead-generation infrastructure for local service businesses, property managers, and real estate pros. Core beliefs: every small business deserves systems that big companies have; clients OWN everything we build (it lives in their accounts); total transparency, no black boxes; we vet clients for fit rather than taking everyone. Services: Branding & Content, Advertising (real-estate flyby video/staging), Smart Websites & Schemas, Leads (custom lead-gen infrastructure — we build your OWN pipeline, never shared/rented leads), Training. Entry point is a $149 30-minute Workflow Map (Calendly). VOICE: calm, plainspoken, confident, warm but not salesy; short sentences; no hype, no emoji, no buzzword salad; concrete and honest. Never invent specific prices beyond the $149 Workflow Map and $499 Deep Look. Keep replies to 1-3 short sentences. If someone seems ready, gently point them to book a Workflow Map or leave a phone/email for JP to reach them. Never claim to be a human — you're JP's assistant.";

// JDC Build (jdc-build.com) homepage chat — same handler, different voice.
const JDC_CHAT_SYSTEM = "You are the JDC Build assistant, chatting on jdc-build.com. JDC Build Inc. is a licensed California general contractor (CSLB #1034042, verifiable on the CSLB site) owned by JP — a second-generation builder in Auburn, CA. Services: home remodels, additions, structural & foundation work (reinforcement, leveling, dry rot), fire hardening, window & door replacement, siding. Service area: Auburn, Placer County, and nearby foothill communities (Meadow Vista, Colfax, Grass Valley, Newcastle, Loomis). Process: walk the property together, plans & designs drawn in-house, daily photo/video updates during the build, final walkthrough. VOICE: plainspoken, grounded, honest — a builder, not a salesman; short sentences; no hype, no emoji. NEVER quote prices, bids, or timelines — those require JP to walk the property. Never invent measurements or costs. The one call to action: request a free estimate — call or text (903) 626-7055, use the form on this page, or email JDC-build@proton.me. Keep replies to 1-3 short sentences. Never claim to be a human — you're JP's site assistant.";

async function siteChat({ messages }, env, cors, systemPrompt = CHAT_SYSTEM) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing messages' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Sanitize: only role/content strings, alternating shape enforced by the API;
  // cap history length and per-message size so the endpoint can't be abused.
  const clean = messages.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 220,
      system: systemPrompt,
      messages: clean,
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok || data?.error) {
    // Surface upstream failures instead of silently returning an empty reply
    return new Response(JSON.stringify({ error: data?.error?.message || `upstream ${upstream.status}` }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const reply = data?.content?.[0]?.text ?? '';

  return new Response(JSON.stringify({ reply }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ─── ROUTE 1: Live review-request SMS generator ──────────────────────────────
// Streams tokens back so the user watches the text appear in real time.
async function reviewText({ businessName }, env, cors) {
  if (!businessName?.trim()) {
    return new Response(JSON.stringify({ error: 'Missing businessName' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 180,
      stream: true,
      messages: [{
        role: 'user',
        content: `Write a short, warm SMS review request for a local business called "${businessName}".
Rules:
- Sound like it's from the owner personally, not a corporation
- Friendly and genuine, never pushy
- Ask for a Google review
- Under 160 characters total
- No emojis
- No hashtags
- Output ONLY the message text, nothing else`,
      }],
    }),
  });

  // Pass the SSE stream straight through to the browser
  return new Response(upstream.body, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ─── ROUTE 2: Mini-audit teaser ──────────────────────────────────────────────
// Quick snapshot — not a deep research. Fast enough for an inline "wow" moment.
async function miniAudit({ businessName }, env, cors) {
  if (!businessName?.trim()) {
    return new Response(JSON.stringify({ error: 'Missing businessName' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a local-business digital presence auditor. Based on typical patterns for a local service business named "${businessName}", estimate their situation.

Return ONLY valid JSON — no prose, no markdown fences:
{
  "score": <integer 1-100>,
  "reviewGap": "<one sentence — likely review count vs. top competitor>",
  "visibilityGap": "<one sentence — organic findability issue>",
  "biggestWin": "<one specific, actionable thing they could do this week>",
  "estimatedLeadsLostPerMonth": <integer>
}`,
      }],
    }),
  });

  const data = await upstream.json();
  const text = data?.content?.[0]?.text ?? '{}';

  return new Response(text, {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ─── ROUTE 3: Full ROI audit (from adaptive quiz inputs) ─────────────────────
// Called after the quiz completes. Inputs from the adaptive flow get passed in.
async function roiAudit({ businessName, inputs }, env, cors) {
  if (!businessName?.trim()) {
    return new Response(JSON.stringify({ error: 'Missing businessName' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const inputSummary = inputs ? JSON.stringify(inputs, null, 2) : 'No additional inputs provided.';

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `You are building a quick ROI estimate for a local service business.

Business: "${businessName}"
Quiz answers: ${inputSummary}

Return ONLY valid JSON — no prose, no markdown fences:
{
  "monthlyRevLost": <integer — estimated monthly revenue lost to gaps>,
  "annualRevLost": <integer>,
  "roiIfFixed": <integer — estimated annual gain if gaps addressed>,
  "paybackMonths": <integer — months to break even on investment>,
  "topOpportunity": "<one sentence — the single highest-leverage fix>",
  "breakdown": [
    { "label": "<category>", "value": "<short finding>", "impact": "high" | "medium" | "low" }
  ]
}

Keep breakdown to 3-5 items. Be specific but concise. Base numbers on real local-business benchmarks.`,
      }],
    }),
  });

  const data = await upstream.json();
  const text = data?.content?.[0]?.text ?? '{}';

  return new Response(text, {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
