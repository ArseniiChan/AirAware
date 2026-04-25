import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are AirAware's in-app assistant. AirAware is a walking-route app
for NYC parents that recommends asthma-aware routes for kids using EPA AirNow
air-quality data, NYC DOHMH pediatric asthma ER visits, and a per-kid
threshold matrix grounded in EPA AQI bands and AAP/AAFA pediatric guidance.

Scope:
- Answer questions about asthma, air quality, the recommendations the user is
  seeing, and NYC pollution sources (bus depots, highways, industrial zones).
- If asked something off-topic, politely steer back to asthma / air quality /
  the route.
- Never give medical diagnoses. For symptom questions, recommend talking to a
  pediatrician or pulmonologist.
- Be concise: under 4 sentences unless the question demands more.
- Use plain language. Avoid raw AQI numbers in answers; prefer
  "good for kids" / "risky for kids with asthma" / "stay inside" framing.
- The Bronx has the highest pediatric asthma rate in the US. If a parent
  mentions the Bronx, acknowledge that context.`;

interface ChatBody {
  messages: { role: 'user' | 'model'; text: string }[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured on the server.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Bad JSON body.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages[] is required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const history = body.messages.slice(0, -1).map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
  const lastUser = body.messages[body.messages.length - 1];
  if (lastUser.role !== 'user') {
    return new Response(JSON.stringify({ error: 'Last message must be from user.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const chat = model.startChat({ history });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await chat.sendMessageStream(lastUser.text);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error.';
        controller.enqueue(encoder.encode(`\n\n[error: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
