import type { FaSolidIcon } from "./fa-icons.generated";

interface BuiltInPage {
  route: string;
  title: string;
  icon: FaSolidIcon;
  navigable?: boolean;
}

/** Shared identity for internal pages in tabs, favicons, and navigation. */
export const BUILT_IN_PAGES: readonly BuiltInPage[] = [
  { route: "/settings", title: "Settings", icon: "gear", navigable: true },
  { route: "/extensions", title: "Extensions", icon: "puzzle-piece", navigable: true },
  { route: "/tab-customization", title: "Tab Customization", icon: "sliders" },
  { route: "/domain-settings", title: "Customization", icon: "sliders" },
  { route: "/pdf-reader", title: "PDF", icon: "file-pdf" },
];

export const routeBase = (url: string): string => url.split("?", 1)[0] ?? url;
export const getBuiltInPage = (url: string) =>
  BUILT_IN_PAGES.find((page) => page.route === routeBase(url));
export const isBuiltInUrl = (url: string): boolean => getBuiltInPage(url) !== undefined;
