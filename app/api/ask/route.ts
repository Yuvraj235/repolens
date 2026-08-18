export const runtime = "nodejs";
export const maxDuration = 60;

interface Source {
  path: string;
  startLine: number;
  endLine: number;
  symbol: string | null;
  included: "full" | "skeleton";
}

interface AskBody {
  question: string;
  context: string;
  sources: Source[];
  repo?: string;
}

const SYSTEM_PROMPT = `You are RepoLens, a precise code assistant.
Answer the user's question using ONLY the repository context provided.
The context is pre-selected by a context engine; some items are full code and some are condensed to signatures (marked with "… lines elided").
Rules:
- Ground every claim in the context. Cite specific locations as \`path:line\`.
- If the context is insufficient to answer, say so plainly and name what's missing.
- Be concise and concrete. Prefer short paragraphs and lists over walls of text.`;

function streamText(text: string, mode: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Emit in small slices so the UI streams naturally.
      const chunks = text.match(/[\s\S]{1,120}/g) ?? [text];
      let i = 0;
      const push = () => {
        if (i < chunks.length) {
          controller.enqueue(encoder.encode(chunks[i++]));
          setTimeout(push, 12);
        } else {
          controller.close();
        }
      };
      push();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "x-repolens-mode": mode },
  });
}

function demoAnswer(body: AskBody): string {
  const top = body.sources.slice(0, 8);
  const lines = top.map((s) => {
    const loc = `\`${s.path}:${s.startLine}\``;
    const sym = s.symbol ? ` — \`${s.symbol}\`` : "";
    const form = s.included === "skeleton" ? " _(signature only)_" : "";
    return `- ${loc}${sym}${form}`;
  });
  return [
    `**Demo mode.** No \`XAI_API_KEY\` is configured on this deployment, so this is a templated answer. Everything above — retrieval, compression, and the token-savings breakdown — is fully live and computed for your question.`,
    ``,
    `For **"${body.question.trim()}"**, the context engine judged these locations most relevant:`,
    ``,
    ...lines,
    ``,
    `Add an xAI API key (\`XAI_API_KEY\`) to get a full natural-language answer from Grok, grounded in exactly this selected context.`,
  ].join("\n");
}

async function streamGrok(body: AskBody): Promise<Response> {
  const apiKey = process.env.XAI_API_KEY!;
  const baseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  const model = process.env.GROK_MODEL || "grok-4.6";

  const userContent = `Repository${body.repo ? ` (${body.repo})` : ""} context:\n\n${body.context}\n\n---\nQuestion: ${body.question}`;

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    const hint =
      upstream.status === 401 || upstream.status === 403
        ? "The XAI_API_KEY appears to be invalid or lacks credits."
        : `xAI returned ${upstream.status}.`;
    return Response.json({ error: `${hint} ${detail.slice(0, 300)}` }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta: string | undefined = json?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // partial/keep-alive line; ignore
            }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n_[stream interrupted: ${String(err)}]_`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "x-repolens-mode": "live" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.question?.trim()) {
    return Response.json({ error: "Ask a question about the repository." }, { status: 400 });
  }
  if (!body.context?.trim()) {
    return Response.json({ error: "No context was selected for this question." }, { status: 400 });
  }

  if (!process.env.XAI_API_KEY) {
    return streamText(demoAnswer(body), "demo");
  }
  return streamGrok(body);
}
