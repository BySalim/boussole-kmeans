try {
  const theme = localStorage.getItem("boussole-theme");
  if (theme === "clair" || theme === "sombre") document.documentElement.dataset.theme = theme;
} catch {}
