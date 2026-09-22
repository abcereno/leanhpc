// supabase/functions/classify-training-chat/index.ts
//
// Not previously tracked in this repo, same as classify-inquiries/index.ts
// right next to it — deploy with
// `supabase functions deploy classify-training-chat` (or paste into the
// dashboard function editor) after editing.
//
// Backs the "AI Training Chat" admin page (src/components/admin/AiTrainingChat.jsx,
// sql/add_classification_rules.sql): an admin describes a classification
// rule in plain English (e.g. "Capital One dealership inquiries should
// always be Do Not Dispute"), this function replies conversationally and,
// when it has enough to act on, proposes a structured rule for the admin
// to confirm. Confirmed rules are saved to public.classification_rules by
// the client (src/utils/classificationChat.js#confirmProposedRule) — this
// function never writes to the DB itself, only proposes.
//
// Same OpenAI JSON-mode pattern as classify-inquiries/index.ts (no
// tool-calling precedent exists in this codebase to mirror instead): one
// call, `response_format: { type: 'json_object' }`, the return shape
// spelled out in the prompt text rather than a schema param.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { OpenAI } from 'https://esm.sh/openai@4.0.0';

const headers = new Headers({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

// Renders existing active rules compactly, same grouped-plain-lines
// approach as classify-inquiries/index.ts's buildAliasPromptBlock — so the
// model doesn't propose a near-duplicate of a rule that already exists,
// and can reference prior rules when the admin says something like
// "same as the Capital One one but for Chase."
function buildExistingRulesBlock(rules: any[]): string {
  if (!Array.isArray(rules) || rules.length === 0) return '';
  const lines = rules.map((r) => {
    const scope = r?.client_id ? 'this client only' : 'all clients (global)';
    return `- [${scope}] ${r?.rule_text || ''}${r?.action ? ` (action: ${r.action})` : ''}`;
  });
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  try {
    const { clientId = null, clientName = null, history = [], message, existingRules = [] } = await req.json();
    if (!message || typeof message !== 'string') throw new Error('Missing message');
    const openaiKey = Deno.env.get('OPENAI_KEY');
    if (!openaiKey) throw new Error('Missing OpenAI key');

    const existingRulesBlock = buildExistingRulesBlock(existingRules);
    const scopeContext = clientId
      ? `This conversation is scoped to one specific client${clientName ? ` (${clientName})` : ''}. Unless the admin explicitly says the rule should apply to every client, propose it as client-scoped ("scope": "client").`
      : `This conversation has no client selected, so it's for global rules that apply to every client. Always propose "scope": "global" here.`;

    const prompt = `
You are helping a credit-repair operations admin teach standing rules to an automated credit-report inquiry classifier (a separate system, classify-inquiries). That classifier reads each inquiry on a client's credit report and labels it "linked" (caused by a real account the client opened), "associated" (Experian-only, a plausible-but-unconfirmed match), or "non-linked" (everything else, safe to dispute/delete). Staff can also mark an inquiry "Do Not Dispute" separately from that automatic classification.

${scopeContext}

${existingRulesBlock ? `Standing rules already taught (do not propose a near-duplicate of one of these — if the admin's message matches one, say so instead of proposing a new rule):\n${existingRulesBlock}\n` : 'No standing rules have been taught yet.'}

Conversation so far:
${(Array.isArray(history) ? history : []).map((m: any) => `${m.role === 'assistant' ? 'You' : 'Admin'}: ${m.content}`).join('\n') || '(none yet)'}

Admin's new message: "${message}"

Reply conversationally and helpfully, like a knowledgeable colleague:
- If the admin described a clear, actionable rule (e.g. a specific creditor/pattern and what should happen with it), confirm you understood it in your reply AND propose a structured rule.
- If the request is vague or missing a key detail (which creditor? which bureau? do they mean always, or only under some condition?), ask a short clarifying question instead, and leave proposedRule null.
- If the admin is just chatting, asking a question about existing rules, or not stating a new rule, respond helpfully and leave proposedRule null.
- Keep replies brief — 1-3 sentences, no bullet lists.

Return ONLY valid JSON, no commentary, in exactly this shape:
{
  "reply": "your conversational response",
  "proposedRule": {
    "ruleText": "one clear plain-English sentence stating the rule",
    "creditorPattern": "the creditor name/substring this rule is about, or null if it's not creditor-specific",
    "action": "a short label for what should happen (e.g. 'do_not_dispute', 'always_non_linked', 'always_linked', 'manual_review'), or null if it's general guidance rather than a specific action",
    "scope": "client" or "global"
  }
}
Set "proposedRule" to null (not an object) whenever you're asking a clarifying question or not proposing a rule this turn.
`;

    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 600
    });

    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) throw new Error('No response from OpenAI');
    const parsed = JSON.parse(responseText);

    return new Response(JSON.stringify({
      success: true,
      reply: parsed.reply || "I didn't quite catch that — could you rephrase?",
      proposedRule: parsed.proposedRule || null
    }), { headers });
  } catch (err) {
    console.error('❌ classify-training-chat error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers });
  }
});
