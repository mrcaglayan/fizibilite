// frontend/src/components/ui/Button.jsx

import React from "react";

const Button = React.forwardRef(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      className = "",
      as: Component = "button",
      onClick,
      type,
      children,
      ...rest
    },
    ref
  ) => {
    const isButton = Component === "button";
    const isDisabled = disabled || loading;
    const classes = ["btn", `btn-${variant}`, `btn-${size}`, className]
      .filter(Boolean)
      .join(" ");
    const content = loading ? "Yukleniyor..." : children;

    if (isButton) {
      return (
        <Component
          ref={ref}
          type={type || "button"}
          className={classes}
          disabled={isDisabled}
          onClick={onClick}
          {...rest}
        >
          {content}
        </Component>
      );
    }

    return (
      <Component
        ref={ref}
        className={classes}
        aria-disabled={isDisabled ? true : undefined}
        onClick={(event) => {
          if (isDisabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
        {...rest}
      >
        {content}
      </Component>
    );
  }
);

Button.displayName = "Button";

export default Button;
