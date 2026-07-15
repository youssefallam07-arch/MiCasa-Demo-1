// Casa — the natural-language reasoning layer for the CIC "Brain".
//
// When ANTHROPIC_API_KEY (or CLAUDE_API_KEY) is set in the environment, casaAsk()
// answers an operator's plain-language question over the LIVE brain snapshot using
// the Claude API — full reasoning, not keyword matching.
//
// When no key is configured, or the call fails for any reason, casaAsk() returns
// null. The caller (POST /admin/brain/ask) then reports source:'local' and the CIC
// console falls back to its built-in data-driven responder. The Brain therefore
// works with zero configuration and only *gains* reasoning once a key is present.
//
// The key is read from the environment only. It is never logged, never returned to
// the client, and never persisted.
import Anthropic from '@anthropic-ai/sdk';

const KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
const MODEL = process.env.CASA_MODEL || 'claude-opus-4-8';

export const casaEnabled = () => !!KEY;

const client = KEY ? new Anthropic({ apiKey: KEY }) : null;

const SYSTEM = `You are Casa, the operations brain of MiCasa — a home-services bidding marketplace in Egypt where verified workers (plumbers, electricians, carpenters, and other trades) bid on jobs that customers post.

You are given a JSON snapshot of the platform's LIVE intelligence: an overall health score (0–100) with its four drivers (coverage, trust, liquidity, throughput), a real-time pulse (jobs posted/active/open, workers, escrow held, commission earned), detected anomalies, trade/zone demand-vs-supply, one-click recommendations, and per-worker risk flags. All money fields ending in "Pst" are in piasters — divide by 100 for Egyptian pounds (e.g. escrowPst 30000 = EGP 300).

Answer the operator's question using ONLY this snapshot. Rules:
- Be concise and direct: 2–4 sentences, no preamble, no "Based on the data…".
- Cite concrete numbers — the health score, counts, EGP amounts, worker names, trade/zone.
- Be action-oriented: say what to do, pointing at the specific demand gap, anomaly, or recommendation.
- If the answer isn't in the snapshot, say so in one line instead of guessing.
- Respond with the final answer only. No internal reasoning, no meta-commentary.`;

// Trim the raw brain object to what actually helps reasoning: drop UI-only fields
// (focusModes) and cap arrays so the prompt stays small and fast.
function snapshot(brain: any) {
  return {
    healthScore: brain.healthScore,
    subScores: brain.subScores,
    pulse: brain.pulse,
    anomalies: (brain.anomalies || []).slice(0, 8).map((a: any) => ({ title: a.title, severity: a.severity, count: a.count, detail: a.detail })),
    demand: (brain.demand || []).slice(0, 12),
    recommendations: (brain.recommendations || []).slice(0, 8).map((r: any) => ({ title: r.title, priority: r.priority, detail: r.detail })),
    workerRisk: (brain.workerRisk || []).slice(0, 10),
  };
}

export async function casaAsk(question: string, brain: any): Promise<string | null> {
  if (!client) return null;
  try {
    // No thinking config: this is an interactive console, so we keep latency low and
    // rely on the system prompt to keep the answer to a tight, final-answer-only form.
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `LIVE PLATFORM SNAPSHOT (JSON):\n${JSON.stringify(snapshot(brain))}\n\nOperator question: ${question}`,
      }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || null;
  } catch (err) {
    console.error('[casa] Claude API call failed — falling back to local responder:', (err as Error).message);
    return null;
  }
}
