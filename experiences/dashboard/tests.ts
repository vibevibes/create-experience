import { defineTest } from "@vibevibes/sdk";

// ── Tests ───────────────────────────────────────────────────────────────────

export const tests = [
  defineTest({
    name: "panel.add creates a panel with correct fields",
    run: async ({ tool, ctx, expect }) => {
      const addPanel = tool("panel.add");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addPanel.handler(context, {
        title: "Revenue",
        type: "metric",
        data: { value: 1000, unit: "USD" },
        position: { x: 100, y: 50 },
        size: { w: 300, h: 200 },
      });

      const state = context.getState();
      expect(state.panels.length).toBe(1);
      expect(state.panels[0].title).toBe("Revenue");
      expect(state.panels[0].type).toBe("metric");
      expect(state.panels[0].data.value).toBe(1000);
      expect(state.panels[0].data.unit).toBe("USD");
      expect(state.panels[0].position.x).toBe(100);
      expect(state.panels[0].position.y).toBe(50);
      expect(state.panels[0].size.w).toBe(300);
      expect(state.panels[0].id).toBeTruthy();
      expect(state.lastActivity).toBeTruthy();
    },
  }),

  defineTest({
    name: "panel.add uses default position and size when omitted",
    run: async ({ tool, ctx, expect }) => {
      const addPanel = tool("panel.add");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addPanel.handler(context, {
        title: "Test Panel",
        type: "note",
      });

      const state = context.getState();
      expect(state.panels[0].position.x).toBe(0);
      expect(state.panels[0].position.y).toBe(0);
      expect(state.panels[0].size.w).toBe(300);
      expect(state.panels[0].size.h).toBe(200);
    },
  }),

  defineTest({
    name: "data.add creates a data point and updates categories",
    run: async ({ tool, ctx, expect }) => {
      const addData = tool("data.add");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addData.handler(context, {
        label: "Q1 Sales",
        value: 50000,
        category: "sales",
      });

      const state = context.getState();
      expect(state.dataPoints.length).toBe(1);
      expect(state.dataPoints[0].label).toBe("Q1 Sales");
      expect(state.dataPoints[0].value).toBe(50000);
      expect(state.dataPoints[0].category).toBe("sales");
      expect(state.dataPoints[0].id).toBeTruthy();
      expect(state.categories.length).toBe(1);
      expect(state.categories[0]).toBe("sales");
    },
  }),

  defineTest({
    name: "data.add accumulates multiple data points",
    run: async ({ tool, ctx, expect }) => {
      const addData = tool("data.add");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addData.handler(context, { label: "A", value: 10, category: "x" });
      await addData.handler(context, { label: "B", value: 20, category: "y" });
      await addData.handler(context, { label: "C", value: 30, category: "x" });

      const state = context.getState();
      expect(state.dataPoints.length).toBe(3);
      expect(state.categories.length).toBe(2);
    },
  }),

  defineTest({
    name: "panel.update modifies panel fields",
    run: async ({ tool, ctx, expect }) => {
      const addPanel = tool("panel.add");
      const updatePanel = tool("panel.update");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addPanel.handler(context, {
        title: "Old Title",
        type: "metric",
      });
      const panelId = context.getState().panels[0].id;

      await updatePanel.handler(context, {
        id: panelId,
        title: "New Title",
        data: { value: 999 },
      });

      const state = context.getState();
      expect(state.panels[0].title).toBe("New Title");
      expect(state.panels[0].data.value).toBe(999);
    },
  }),

  defineTest({
    name: "panel.remove deletes a panel by ID",
    run: async ({ tool, ctx, expect }) => {
      const addPanel = tool("panel.add");
      const removePanel = tool("panel.remove");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addPanel.handler(context, { title: "A", type: "note" });
      await addPanel.handler(context, { title: "B", type: "metric" });
      expect(context.getState().panels.length).toBe(2);

      const idToRemove = context.getState().panels[0].id;
      await removePanel.handler(context, { id: idToRemove });

      const state = context.getState();
      expect(state.panels.length).toBe(1);
      expect(state.panels[0].title).toBe("B");
    },
  }),

  defineTest({
    name: "data.clear removes all data points",
    run: async ({ tool, ctx, expect }) => {
      const addData = tool("data.add");
      const clearData = tool("data.clear");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addData.handler(context, { label: "X", value: 1, category: "a" });
      await addData.handler(context, { label: "Y", value: 2, category: "b" });
      expect(context.getState().dataPoints.length).toBe(2);

      await clearData.handler(context, {});

      const state = context.getState();
      expect(state.dataPoints.length).toBe(0);
      expect(state.categories.length).toBe(0);
    },
  }),

  defineTest({
    name: "data.clear with category only removes that category",
    run: async ({ tool, ctx, expect }) => {
      const addData = tool("data.add");
      const clearData = tool("data.clear");
      const context = ctx({
        state: { panels: [], dataPoints: [], categories: [], lastActivity: 0 },
      });

      await addData.handler(context, { label: "X", value: 1, category: "keep" });
      await addData.handler(context, { label: "Y", value: 2, category: "remove" });
      await addData.handler(context, { label: "Z", value: 3, category: "keep" });

      await clearData.handler(context, { category: "remove" });

      const state = context.getState();
      expect(state.dataPoints.length).toBe(2);
      expect(state.categories.length).toBe(1);
      expect(state.categories[0]).toBe("keep");
    },
  }),
];
