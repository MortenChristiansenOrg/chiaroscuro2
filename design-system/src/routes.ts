import { type ComponentType, lazy } from "react";

interface Route {
  path: string;
  title: string;
  group?: string;
  component: React.LazyExoticComponent<ComponentType>;
}

export const routes: Route[] = [
  // Overview
  { path: "/", title: "Overview", component: lazy(() => import("./pages/index.mdx")) },

  // Guides
  {
    path: "/component-guide",
    title: "Component Guide",
    group: "Guides",
    component: lazy(() => import("./pages/component-guide.mdx")),
  },

  // Foundations
  {
    path: "/colors",
    title: "Colors",
    group: "Foundations",
    component: lazy(() => import("./pages/colors.mdx")),
  },
  {
    path: "/typography",
    title: "Typography",
    group: "Foundations",
    component: lazy(() => import("./pages/typography.mdx")),
  },
  {
    path: "/spacing",
    title: "Spacing",
    group: "Foundations",
    component: lazy(() => import("./pages/spacing.mdx")),
  },
  {
    path: "/borders-radius",
    title: "Geometry & Borders",
    group: "Foundations",
    component: lazy(() => import("./pages/borders-radius.mdx")),
  },
  {
    path: "/shadows-effects",
    title: "Shadows & Depth",
    group: "Foundations",
    component: lazy(() => import("./pages/shadows-effects.mdx")),
  },
  {
    path: "/motion",
    title: "Motion & Animation",
    group: "Foundations",
    component: lazy(() => import("./pages/motion.mdx")),
  },
  {
    path: "/icons",
    title: "Icons",
    group: "Foundations",
    component: lazy(() => import("./pages/icons.mdx")),
  },

  // Behavior
  {
    path: "/interaction",
    title: "Interaction Feedback",
    group: "Behavior",
    component: lazy(() => import("./pages/interaction.mdx")),
  },
  {
    path: "/keyboard-focus",
    title: "Keyboard & Focus",
    group: "Behavior",
    component: lazy(() => import("./pages/keyboard-focus.mdx")),
  },
  {
    path: "/accessibility",
    title: "Accessibility",
    group: "Behavior",
    component: lazy(() => import("./pages/accessibility.mdx")),
  },
  {
    path: "/layout",
    title: "Layout Composition",
    group: "Behavior",
    component: lazy(() => import("./pages/layout.mdx")),
  },

  // Components
  {
    path: "/components/buttons",
    title: "Buttons",
    group: "Components",
    component: lazy(() => import("./pages/components/buttons.mdx")),
  },
  {
    path: "/components/tabs",
    title: "Tabs",
    group: "Components",
    component: lazy(() => import("./pages/components/tabs.mdx")),
  },
  {
    path: "/components/sidebar",
    title: "Sidebar",
    group: "Components",
    component: lazy(() => import("./pages/components/sidebar.mdx")),
  },
  {
    path: "/components/address-bar",
    title: "Address Bar",
    group: "Components",
    component: lazy(() => import("./pages/components/address-bar.mdx")),
  },
  {
    path: "/components/tooltips",
    title: "Tooltips",
    group: "Components",
    component: lazy(() => import("./pages/components/tooltips.mdx")),
  },
  {
    path: "/components/command-palette",
    title: "Command Palette",
    group: "Components",
    component: lazy(() => import("./pages/components/command-palette.mdx")),
  },
  {
    path: "/components/pinned-tabs",
    title: "Pinned Tabs",
    group: "Components",
    component: lazy(() => import("./pages/components/pinned-tabs.mdx")),
  },
  {
    path: "/components/workspace-switcher",
    title: "Workspace Switcher",
    group: "Components",
    component: lazy(() => import("./pages/components/workspace-switcher.mdx")),
  },
  {
    path: "/components/web-content-host",
    title: "Web Content Host",
    group: "Components",
    component: lazy(() => import("./pages/components/web-content-host.mdx")),
  },
];
