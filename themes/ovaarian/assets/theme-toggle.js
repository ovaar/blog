document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');

    // Apply saved preference if it exists
    if (savedTheme) {
        // Apply the saved theme (either 'light' or 'dark')
        rootElement.setAttribute('color-mode', savedTheme);
    } else {
        // If no saved preference, use 'dark' as default
        rootElement.setAttribute('color-mode', 'dark');
        localStorage.setItem('theme', 'dark');
    }

    // Toggle theme when button is clicked
    themeToggle.addEventListener('click', () => {
        const currentTheme = rootElement.getAttribute('color-mode');

        // Simple toggle between light and dark
        let newTheme = 'light';
        if (currentTheme !== null) {
            if (currentTheme === 'light') {
                // If light mode, switch to dark
                newTheme = 'dark';
            }
            else if (currentTheme === 'dark') {
                newTheme = 'light';
            }
        }


        console.log(newTheme)

        rootElement.setAttribute('color-mode', newTheme);
        localStorage.setItem('theme', newTheme);
    });
});
