import { MDXProvider } from "@mdx-js/react";
import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { Layout } from "./components/Layout";
import { mdxComponents } from "./components/MDXComponents";
import { routes } from "./routes";

export function App() {
  return (
    <MDXProvider components={mdxComponents}>
      <Layout>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
          <Switch>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} component={r.component} />
            ))}
            <Route>
              <div className="text-sm text-muted-foreground">Page not found.</div>
            </Route>
          </Switch>
        </Suspense>
      </Layout>
    </MDXProvider>
  );
}
