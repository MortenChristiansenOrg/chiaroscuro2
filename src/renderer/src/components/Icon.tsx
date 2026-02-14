import type { CSSProperties } from "react";
import type { FaIconForStyle, FaStyle } from "../../../shared/fa-icons.generated";

type IconProps<S extends FaStyle = "solid"> = {
  name: FaIconForStyle<S>;
  style?: S;
  css?: CSSProperties;
} & Omit<React.JSX.IntrinsicElements["i"], "style" | "children">;

/**
 * Typed Font Awesome icon. Renders an `<i>` element with the correct FA classes.
 *
 * @example
 * <Icon name="chevron-left" />
 * <Icon name="copy" style="regular" />
 * <Icon name="github" style="brands" css={{ fontSize: 14 }} />
 */
export function Icon<S extends FaStyle = "solid">({
  name,
  style,
  css,
  className,
  ...rest
}: IconProps<S>) {
  const s = style ?? "solid";
  const cls = `fa-${s} fa-${name}${className ? ` ${className}` : ""}`;
  return <i className={cls} style={css} {...rest} />;
}
