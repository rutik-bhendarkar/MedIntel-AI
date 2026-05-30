document.addEventListener("DOMContentLoaded", () => {
    const themeToggle = document.getElementById("themeToggle");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    function setTheme(mode) {
        const isDark = mode === "dark";

        document.body.classList.toggle("dark-mode", isDark);
        localStorage.setItem("theme", isDark ? "dark" : "light");

        if (themeToggle) {
            themeToggle.textContent = isDark ? "Light" : "Dark";
            themeToggle.setAttribute("aria-pressed", String(isDark));
            themeToggle.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
        }
    }

    const savedTheme = localStorage.getItem("theme") || (prefersDark ? "dark" : "light");
    setTheme(savedTheme);

    if (!themeToggle) return;

    themeToggle.addEventListener("click", (event) => {
        event.preventDefault();
        const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
        setTheme(nextTheme);
    });
});
