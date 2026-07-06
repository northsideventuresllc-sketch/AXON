import { NextResponse } from "next/server";
import { generateAxonReply } from "@/lib/axon/axon-web-chat";
import { fetchChatHistory } from "@/lib/axon/axon-profile";
import { requireAxonOperatorId } from "@/lib/axon/operator";

export async function GET() {
  try {
    const operatorId = await requireAxonOperatorId();
    const messages = await fetchChatHistory(operatorId);
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load chat";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const { message, channel = "chat" } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const history = await fetchChatHistory(operatorId);
    const result = await generateAxonReply(message.trim(), channel, history, operatorId);

    return NextResponse.json({
      reply: result.reply,
      userMsg: result.userMsg,
      assistantMsg: result.assistantMsg,
      workspace: result.workspace,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
