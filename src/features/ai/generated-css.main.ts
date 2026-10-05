import { ident, parse, walk } from "css-tree";

/** Generated CSS is applied automatically, so it must not initiate resource requests. */
export function validateGeneratedCss(source: string): void {
  const rejected = () => {
    throw new Error(
      "AI returned CSS with remote resource references or unsupported CSS syntax. Ask for a change using local styles only. Your previous CSS is unchanged.",
    );
  };
  try {
    const ast = parse(source, { parseCustomProperty: true, onParseError: rejected });
    walk(ast, (node) => {
      if (node.type === "Raw") rejected();
      if (node.type === "Atrule" && ident.decode(node.name).toLowerCase() === "import") rejected();
      if (
        node.type === "Function" &&
        ["url", "image-set", "-webkit-image-set", "src", "image"].includes(
          ident.decode(node.name).toLowerCase(),
        )
      )
        rejected();
      if (node.type === "Url" && !/^data:/i.test(ident.decode(node.value).trim())) rejected();
    });
  } catch {
    rejected();
  }
}
