/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */

// src/components/icon/library.config.ts
var defaultIconFamily = "";
var defaultIconVariant = "";
function setDefaultIconFamilyAndVariant(family, variant) {
  defaultIconFamily = family;
  if (variant !== void 0) {
    defaultIconVariant = variant;
  }
}
function getDefaultIconFamily() {
  if (!defaultIconFamily) {
    defaultIconFamily = document.querySelector("[data-fa-family]")?.getAttribute("data-fa-family") || "classic";
  }
  return defaultIconFamily;
}
function getDefaultIconVariant() {
  if (!defaultIconVariant) {
    defaultIconVariant = document.querySelector("[data-fa-variant]")?.getAttribute("data-fa-variant") || "solid";
  }
  return defaultIconVariant;
}

export {
  setDefaultIconFamilyAndVariant,
  getDefaultIconFamily,
  getDefaultIconVariant
};
