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
    title: "Borders & Radius",
    group: "Foundations",
    component: lazy(() => import("./pages/borders-radius.mdx")),
  },
  {
    path: "/shadows-effects",
    title: "Shadows & Effects",
    group: "Foundations",
    component: lazy(() => import("./pages/shadows-effects.mdx")),
  },
  {
    path: "/icons",
    title: "Icons",
    group: "Foundations",
    component: lazy(() => import("./pages/icons.mdx")),
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
    path: "/components/cards",
    title: "Cards",
    group: "Components",
    component: lazy(() => import("./pages/components/cards.mdx")),
  },
  {
    path: "/components/tooltips",
    title: "Tooltips",
    group: "Components",
    component: lazy(() => import("./pages/components/tooltips.mdx")),
  },
  {
    path: "/components/workspace-switcher",
    title: "Workspace Switcher",
    group: "Components",
    component: lazy(() => import("./pages/components/workspace-switcher.mdx")),
  },
];
