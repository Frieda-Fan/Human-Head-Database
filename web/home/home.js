if (window.location.pathname.startsWith("/web/")) {
  const localRoutes = {
    "/measure": "/web/modules/measure/index.html",
    "/generate": "/web/modules/generate/index.html",
  };

  Object.entries(localRoutes).forEach(([cleanRoute, staticRoute]) => {
    document.querySelectorAll(`a[href="${cleanRoute}"]`).forEach((link) => {
      link.href = staticRoute;
    });
  });
}
