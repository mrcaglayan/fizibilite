import React from "react";
import { useI18n } from "./I18nContext";
import { translatePhrase } from "./translations";

const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function shouldSkipNode(node) {
  let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    if (current.hasAttribute?.("data-i18n-skip")) return true;
    current = current.parentElement;
  }
  return false;
}

function translateTextNode(node, language) {
  if (!node.nodeValue || !node.nodeValue.trim()) return;
  if (shouldSkipNode(node)) return;
  const translated = translatePhrase(node.nodeValue, language);
  if (translated !== node.nodeValue) {
    node.nodeValue = translated;
  }
}

function translateAttributes(element, language) {
  if (!element || shouldSkipNode(element)) return;
  for (const attr of ATTRIBUTES) {
    if (!element.hasAttribute(attr)) continue;
    const current = element.getAttribute(attr);
    const translated = translatePhrase(current, language);
    if (translated !== current) {
      element.setAttribute(attr, translated);
    }
  }
}

function translateElement(root, language) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, language);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

  const elementRoot = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
  if (!elementRoot) return;

  if (elementRoot.nodeType === Node.ELEMENT_NODE) {
    translateAttributes(elementRoot, language);
  }

  const textWalker = document.createTreeWalker(
    elementRoot,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        return shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  const textNodes = [];
  while (textWalker.nextNode()) textNodes.push(textWalker.currentNode);
  textNodes.forEach((node) => translateTextNode(node, language));

  const attrWalker = document.createTreeWalker(
    elementRoot,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        return shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  const elements = [];
  while (attrWalker.nextNode()) elements.push(attrWalker.currentNode);
  elements.forEach((node) => translateAttributes(node, language));
}

function translateTitle(language) {
  const translated = translatePhrase(document.title, language);
  if (translated !== document.title) {
    document.title = translated;
  }
}

export default function DomTranslator() {
  const { language } = useI18n();

  React.useEffect(() => {
    let rafId = 0;
    const run = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        translateElement(document, language);
        translateTitle(language);
      });
    };

    run();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => translateElement(node, language));
        } else if (mutation.type === "characterData") {
          translateTextNode(mutation.target, language);
        } else if (mutation.type === "attributes") {
          translateAttributes(mutation.target, language);
        }
      }
      translateTitle(language);
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRIBUTES,
      });
    }

    const titleEl = document.querySelector("title");
    if (titleEl) {
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [language]);

  return null;
}
