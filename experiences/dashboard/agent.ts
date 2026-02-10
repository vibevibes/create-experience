import { createChatHints, createBugReportHints } from "@vibevibes/sdk";

// ── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are the Analyst — a data-driven AI that loves finding patterns, correlations, and hidden insights in data.

## Your Tools
- panel.add — add a dashboard panel (metric, chart, list, or note)
- panel.update — update a panel's data, title, position, or size
- panel.remove — remove a panel
- data.add — add a data point with label, value, and category
- data.clear — clear data points (optionally by category)
- _chat.send — communicate with the human

## Panel Types
- **metric**: Single KPI display. Set data: { value: 42, unit: "users", delta: 12 }
- **chart**: Bar chart. Set data: { category: "sales" } to filter data points by category
- **list**: Bullet list. Set data: { items: ["Insight 1", "Insight 2"] }
- **note**: Freeform text insight. Set data: { text: "The data suggests..." }

## Your Approach
1. When the human adds data, analyze it immediately
2. Spot trends — is a value unusually high or low? Is there a pattern over time?
3. Create insight panels (type: "note") with your observations
4. Suggest visualizations — add chart panels for categories with enough data
5. Create summary metric panels that aggregate data (totals, averages, max)
6. Compare categories — look for correlations the human might miss
7. Be proactive: suggest what data the human should add next
8. Keep the dashboard organized — suggest layouts and groupings

## Style
- Be data-driven and precise in your observations
- Use specific numbers: "Revenue grew 23% from Q1 to Q2" not "Revenue went up"
- Create panels with descriptive titles that summarize the insight
- When in doubt, add a note panel explaining what you see
- Use chat to explain your analysis to the human

## Important
- Always use descriptive panel titles
- When creating chart panels, specify data.category to filter the right data
- Metric panels should summarize: totals, averages, deltas
- List panels are great for ranked insights or action items
- Note panels are your primary insight delivery mechanism`;

// ── Hints ────────────────────────────────────────────────────────────────────

export const hints = [
  ...createChatHints(),
  ...createBugReportHints(),
  {
    trigger: "New data points were added — analyze and provide insights",
    condition: `(state.dataPoints || []).length > 0 && Date.now() - (state.lastActivity || 0) < 5000`,
    suggestedTools: ["panel.add", "_chat.send"],
    priority: "high" as const,
    cooldownMs: 10000,
  },
  {
    trigger: "Dashboard has panels — check layout and suggest improvements",
    condition: `(state.panels || []).length > 2`,
    suggestedTools: ["panel.update", "panel.add", "_chat.send"],
    priority: "medium" as const,
    cooldownMs: 30000,
  },
  {
    trigger: "Periodic trend check — look for patterns in accumulated data",
    condition: `(state.dataPoints || []).length >= 3`,
    suggestedTools: ["panel.add", "data.add", "_chat.send"],
    priority: "low" as const,
    cooldownMs: 30000,
  },
  {
    trigger: "Dashboard is empty — suggest getting started",
    condition: `(state.panels || []).length === 0 && (state.dataPoints || []).length === 0`,
    suggestedTools: ["_chat.send", "panel.add", "data.add"],
    priority: "high" as const,
    cooldownMs: 15000,
  },
  {
    trigger: "Multiple categories exist — compare and correlate",
    condition: `(state.categories || []).length >= 2`,
    suggestedTools: ["panel.add", "_chat.send"],
    priority: "medium" as const,
    cooldownMs: 30000,
  },
];

// ── Observe (curate what the agent sees) ─────────────────────────────────────

export function observe(
  state: Record<string, any>,
  _event: any,
  _actorId: string,
) {
  const panels = state.panels || [];
  const dataPoints = state.dataPoints || [];
  const categories = state.categories || [];

  // Build a category summary
  const categorySummary: Record<string, { count: number; total: number; avg: number }> = {};
  for (const dp of dataPoints) {
    if (!categorySummary[dp.category]) {
      categorySummary[dp.category] = { count: 0, total: 0, avg: 0 };
    }
    categorySummary[dp.category].count++;
    categorySummary[dp.category].total += dp.value;
  }
  for (const key of Object.keys(categorySummary)) {
    categorySummary[key].avg =
      categorySummary[key].total / categorySummary[key].count;
  }

  // Recent changes
  const recentPoints = dataPoints
    .slice(-5)
    .map((dp: any) => `${dp.label}: ${dp.value} (${dp.category})`);

  // Trend: compare last 3 values if they exist
  let trendSummary = "insufficient data";
  if (dataPoints.length >= 3) {
    const last3 = dataPoints.slice(-3).map((dp: any) => dp.value);
    const increasing = last3[0] < last3[1] && last3[1] < last3[2];
    const decreasing = last3[0] > last3[1] && last3[1] > last3[2];
    trendSummary = increasing ? "trending up" : decreasing ? "trending down" : "fluctuating";
  }

  return {
    panelCount: panels.length,
    panelTypes: panels.map((p: any) => `${p.title} (${p.type})`),
    totalDataPoints: dataPoints.length,
    categories,
    categorySummary,
    recentChanges: recentPoints,
    trendSummary,
  };
}

// ── Agent Slots ──────────────────────────────────────────────────────────────

export const agents = [
  {
    role: "analyst",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [
      "panel.add",
      "panel.update",
      "panel.remove",
      "data.add",
      "data.clear",
      "_chat.send",
    ],
    autoSpawn: true,
    maxInstances: 1,
  },
];
