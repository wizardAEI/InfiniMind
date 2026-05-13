import * as z from "zod/v4";

const organizationGuidance = `Organization guidance: Root Canvas is the default place for ordinary card-set networks. Prefer creating or updating card sets directly under root while the network remains easy to scan. Create an organization only when you are restructuring Root Canvas or isolating a complex model/concept that would otherwise make Root Canvas visually dense.`;

export function registerPrompts(server) {
  server.registerPrompt(
    "review_project",
    {
      title: "Review InfiniMind Project",
      description: "Review a project without making changes.",
      argsSchema: { projectId: z.string(), focus: z.string().optional() },
    },
    async ({ projectId, focus }) => promptMessage(`Review InfiniMind project ${projectId}${focus ? ` with focus: ${focus}` : ""}.

Use infinimind://project/${projectId}/markdown and infinimind://project/${projectId}/graph. Return findings, risks, and suggested next edits. Do not call write tools.`)
  );

  server.registerPrompt(
    "expand_board",
    {
      title: "Expand InfiniMind Board",
      description: "Plan new sets/cards for a topic.",
      argsSchema: { projectId: z.string(), topic: z.string(), count: z.string().optional() },
    },
    async ({ projectId, topic, count }) => promptMessage(`Expand InfiniMind project ${projectId} around topic "${topic}" with ${count || "a small set of"} new cards/sets.

First read the project resources, then propose a concise plan. ${organizationGuidance} Use infinimind_apply_operations with dryRun: true before any real write.`)
  );

  server.registerPrompt(
    "organize_canvas",
    {
      title: "Organize InfiniMind Canvas",
      description: "Suggest layout and connection cleanup.",
      argsSchema: { projectId: z.string(), layoutGoal: z.string().optional() },
    },
    async ({ projectId, layoutGoal }) => promptMessage(`Organize InfiniMind project ${projectId}${layoutGoal ? ` for this goal: ${layoutGoal}` : ""}.

Read the graph and project markdown, suggest a layout and missing/removable connections, then use dry-run operations before writing. ${organizationGuidance}`)
  );

  server.registerPrompt(
    "capture_to_cards",
    {
      title: "Capture Text To InfiniMind Cards",
      description: "Turn source text into card-ready content.",
      argsSchema: { projectId: z.string(), sourceText: z.string() },
    },
    async ({ projectId, sourceText }) => promptMessage(`Turn this source text into InfiniMind cards for project ${projectId}.

Source:
${sourceText}

Create a dry-run batch with coherent sets, text cards, and useful links only if URLs are present in the source. ${organizationGuidance}`)
  );

  server.registerPrompt(
    "find_missing_links",
    {
      title: "Find Missing InfiniMind Links",
      description: "Look for sets that should be connected.",
      argsSchema: { projectId: z.string() },
    },
    async ({ projectId }) => promptMessage(`Find likely missing connections in InfiniMind project ${projectId}.

Read the graph and markdown. Return a short rationale for each proposed connection and use dry-run create_connection operations only.`)
  );

  server.registerPrompt(
    "cleanup_workspace",
    {
      title: "Cleanup InfiniMind Workspace",
      description: "Find duplicates, empty cards, broken image refs, and trash cleanup candidates.",
      argsSchema: { projectId: z.string().optional() },
    },
    async ({ projectId }) => promptMessage(`Clean up the InfiniMind workspace${projectId ? ` project ${projectId}` : ""}.

Start with infinimind_validate_workspace and relevant resources. Report duplicates, empty cards, broken references, and trash candidates. Do not delete anything unless the user explicitly confirms.`)
  );
}

function promptMessage(text) {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text,
        },
      },
    ],
  };
}
