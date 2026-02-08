import type { ComponentPropsWithoutRef } from "react";

export const mdxComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-2xl font-semibold tracking-tight mt-10 mb-6 first:mt-0" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className="text-lg font-semibold tracking-tight mt-12 mb-4 pb-2.5 border-b border-border"
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-base font-medium mt-8 mb-3" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="text-[13.5px] leading-[1.7] text-muted-foreground mb-5" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="text-[13.5px] leading-[1.7] text-muted-foreground mb-5 ml-6 list-disc"
      {...props}
    />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="text-[13.5px] leading-[1.7] text-muted-foreground mb-5 ml-6 list-decimal"
      {...props}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => <li className="mb-1.5" {...props} />,
  code: (props: ComponentPropsWithoutRef<"code">) => <code className="ds-code" {...props} />,
  pre: (props: ComponentPropsWithoutRef<"pre">) => <pre className="ds-pre" {...props} />,
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="ds-table-wrap">
      <table {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => <th {...props} />,
  td: (props: ComponentPropsWithoutRef<"td">) => <td {...props} />,
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="border-l-2 border-border pl-5 italic text-muted-foreground mb-5"
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => <hr className="my-10 border-border" {...props} />,
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-primary underline underline-offset-4 hover:text-primary/80" {...props} />
  ),
};
