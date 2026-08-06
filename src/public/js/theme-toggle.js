(function () {
    // Detectar preferencia guardada o tema preferido del sistema
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    // Aplicar inmediatamente al <html> para prevenir FOUC (parpadeo blanco)
    document.documentElement.setAttribute('data-theme', initialTheme);

    window.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('themeToggleBtn');
        if (!toggleBtn) return;

        function updateBtnIcon(theme) {
            toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
            toggleBtn.setAttribute('title', theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro');
            toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro');
        }

        updateBtnIcon(initialTheme);

        toggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateBtnIcon(newTheme);
        });
    });
})();
