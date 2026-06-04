const LABELS = {
  home: "首页",
  measure: "头模测量",
  generate: "头模生成",
};

function usesStaticWebPaths() {
  return window.location.pathname.startsWith("/web/");
}

function routeFor(key) {
  if (!usesStaticWebPaths()) {
    if (key === "home") return "/";
    return `/${key}`;
  }

  return {
    home: "/web/index.html",
    measure: "/web/modules/measure/index.html",
    generate: "/web/modules/generate/index.html",
  }[key];
}

const ITEMS = [
  { key: "home", label: LABELS.home },
  { key: "measure", label: LABELS.measure },
  { key: "generate", label: LABELS.generate },
];

function resolveActiveKey(container) {
  const configured = container.dataset.siteNav;
  if (configured) return configured;

  const path = window.location.pathname;
  if (path.includes("/measure")) return "measure";
  if (path.includes("/generate")) return "generate";
  return "home";
}

function createNavigation(activeKey) {
  const nav = document.createElement("nav");
  nav.className = "site-switcher";
  nav.setAttribute("aria-label", "功能板块");

  ITEMS.forEach((item) => {
    const link = document.createElement("a");
    link.href = routeFor(item.key);
    link.textContent = item.label;
    if (item.key === activeKey) link.className = "active";
    nav.appendChild(link);
  });

  return nav;
}

const containers = document.querySelectorAll("[data-site-nav]");

containers.forEach((container) => {
  container.replaceWith(createNavigation(resolveActiveKey(container)));
});

if (!containers.length) {
  document.querySelectorAll(".site-switcher").forEach((nav) => {
    nav.replaceWith(createNavigation(resolveActiveKey(nav)));
  });
}
