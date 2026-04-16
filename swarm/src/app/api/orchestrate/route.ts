import { db } from "@/lib/db";
import { callAgent } from "@/lib/llm";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const task: string = body.task;
  if (!task) return Response.json({ error: "Missing 'task' field" }, { status: 400 });

  await logActivity("task", `Conductor received: "${task.slice(0, 60)}..."`);

  const breakdown = await callAgent(
    `You are a task orchestrator for Swarm, a marketplace of specialized crypto/blockchain agents. Break a complex task into subtasks that each map to ONE of these specialists:

- Chainsight (on-chain forensics, fund tracing, wallet clustering) - $0.14/call [agent key: linguaBot]
- Solmantis (Solidity exploit detection, reentrancy, proxy storage collisions) - $0.18/call [agent key: codeReviewer]
- MEV Scope (sandwich attacks, JIT liquidity, private-mempool flow) - $0.09/call [agent key: summarizer]
- RegulaNet (MiCA, SEC, FATF regulatory analysis) - $0.22/call [agent key: solidityAuditor]

If a subtask needs real human judgment (edge-case legal wording, tokenomics intuition, final architectural sign-off), mark it as "HUMAN_NEEDED".

Respond as JSON array only: [{"agent": "linguaBot"|"codeReviewer"|"summarizer"|"solidityAuditor"|"HUMAN_NEEDED", "subtask": "short description", "input": "the actual input to send"}]`,
    task,
    { structured: true }
  );

  let subtasks: Array<{ agent: string; subtask: string; input: string }>;
  try {
    const jsonMatch = breakdown.match(/\[[\s\S]*\]/);
    subtasks = JSON.parse(jsonMatch?.[0] || "[]");
  } catch {
    subtasks = [{ agent: "summarizer", subtask: "Process the request", input: task }];
  }

  // Cap fan-out so we don't blow the 60s serverless budget with many parallel
  // Gemini 3.1 Pro thinking calls. Four is plenty for a demo conductor run.
  subtasks = subtasks.slice(0, 4);

  type SubResult = {
    agent: string;
    subtask: string;
    result: string;
    price: string;
    type: "agent" | "human";
  };

  const results: SubResult[] = await Promise.all(
    subtasks.map(async (sub): Promise<SubResult | null> => {
      if (sub.agent === "HUMAN_NEEDED") {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.task.create({
          data: {
            id: taskId,
            description: sub.subtask,
            bounty: "$0.50",
            skill: "Expert Judgment",
            status: "open",
            postedBy: "orchestrator",
          },
        });
        await logActivity("task", `Conductor escalated to human: "${sub.subtask.slice(0, 50)}..."`);
        return {
          agent: "Human Expert",
          subtask: sub.subtask,
          result: `Task posted for human expert (${taskId}). Awaiting claim.`,
          price: "$0.50",
          type: "human",
        };
      }

      const agent = await db.agent.findUnique({ where: { id: sub.agent } });
      if (!agent) return null;

      await logActivity("payment", `Conductor hiring ${agent.name} — ${agent.price} USDC`);

      let result: string;
      try {
        result = await callAgent(agent.systemPrompt ?? "", sub.input);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        result = `(${agent.name} call failed: ${msg})`;
      }

      const score = 4 + Math.random();
      const updated = await db.agent.update({
        where: { id: agent.id },
        data: {
          totalCalls: { increment: 1 },
          ratingsCount: { increment: 1 },
          reputation:
            Math.round(((agent.reputation * agent.ratingsCount + score) / (agent.ratingsCount + 1)) * 10) / 10,
        },
      });

      await logActivity(
        "reputation",
        `${agent.name} reputation updated: ${updated.reputation}/5 (${updated.ratingsCount} reviews)`
      );

      return {
        agent: agent.name,
        subtask: sub.subtask,
        result,
        price: agent.price,
        type: "agent",
      };
    })
  ).then((arr) => arr.filter((x): x is SubResult => x !== null));

  return Response.json({
    originalTask: task,
    subtasks: results,
    totalCost: results
      .reduce((sum, r) => sum + parseFloat(r.price.replace("$", "")), 0)
      .toFixed(2),
  });
}
