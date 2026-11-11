import type { DetailedHTMLProps, HTMLAttributes } from "react";

type CustomElement<T = HTMLElement> = DetailedHTMLProps<HTMLAttributes<T>, T> & Record<string, any>;

type MdElements = {
  "md-filled-button": CustomElement;
  "md-outlined-button": CustomElement;
  "md-filled-tonal-button": CustomElement;
  "md-elevated-button": CustomElement;
  "md-text-button": CustomElement;
  "md-icon-button": CustomElement;
  "md-filled-icon-button": CustomElement;
  "md-filled-tonal-icon-button": CustomElement;
  "md-outlined-icon-button": CustomElement;
  "md-checkbox": CustomElement;
  "md-switch": CustomElement;
  "md-slider": CustomElement;
  "md-dialog": CustomElement;
  "md-outlined-text-field": CustomElement;
  "md-filled-text-field": CustomElement;
  "md-chip-set": CustomElement;
  "md-assist-chip": CustomElement;
  "md-filter-chip": CustomElement;
  "md-input-chip": CustomElement;
  "md-suggestion-chip": CustomElement;
  "md-divider": CustomElement;
  "md-elevation": CustomElement;
  "md-focus-ring": CustomElement;
  "md-ripple": CustomElement;
  "md-icon": CustomElement;
  "md-circular-progress": CustomElement;
  "md-linear-progress": CustomElement;
  "md-tabs": CustomElement;
  "md-primary-tab": CustomElement;
  "md-secondary-tab": CustomElement;
  "md-list": CustomElement;
  "md-list-item": CustomElement;
  "md-menu": CustomElement;
  "md-menu-item": CustomElement;
  "md-radio": CustomElement;
  "md-filled-select": CustomElement;
  "md-outlined-select": CustomElement;
  "md-select-option": CustomElement;
  "md-fab": CustomElement;
};

declare global {
  namespace JSX {
    interface IntrinsicElements extends MdElements {}
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends MdElements {}
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends MdElements {}
  }
}
