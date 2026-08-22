/* Shared global header. The page body remains responsible for its own content header. */
(function () {
    const currentPath = window.location.pathname;
    const sectionForPath = function (path) {
        if (path === '/structure/' || path === '/structure') return 'structure';
        if (path === '/theory/' || path === '/theory') return 'theory';
        if (path === '/services/' || path === '/services') return 'services';
        if (path === '/insights/' || path.startsWith('/insights/')) return 'insights';
        if (path === '/case-studies/' || path === '/case-studies' || path.startsWith('/cases/')) return 'cases';
        return '';
    };

    const activeSection = sectionForPath(currentPath);
    const navItems = [
        ['structure', '/structure/', '構造とは'],
        ['theory', '/theory/', '理論'],
        ['services', '/services/', '支援モデル'],
        ['insights', '/insights/', 'コラム'],
        ['cases', '/case-studies/', '事例']
    ];

    const navLinks = navItems.map(function ([section, href, label]) {
        const active = section === activeSection;
        return `<a href="${href}"${active ? ' aria-current="page"' : ''} class="text-sm font-medium transition-colors ${active ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-slate-600 hover:text-blue-600'}">${label}</a>`;
    }).join('');

    const headerMarkup = `
        <header id="global-header" class="fixed top-0 left-0 w-full z-50 bg-white border-b border-slate-200 py-4">
            <div class="container mx-auto px-6 max-w-6xl flex justify-between items-center">
                <a href="/" class="flex items-center gap-2 no-underline" aria-label="マケマケ トップページ">
                    <span class="w-8 h-8 bg-slate-900 rounded-sm flex items-center justify-center" aria-hidden="true">
                        <svg viewBox="0 0 24 24" class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a1.92 1.92 0 0 0-1.66 0L2.6 6.08a1.92 1.92 0 0 0-1.1 1.73v8.38a1.92 1.92 0 0 0 1.1 1.73l8.57 3.9a1.92 1.92 0 0 0 1.66 0l8.57-3.9a1.92 1.92 0 0 0 1.1-1.73V7.81a1.92 1.92 0 0 0-1.1-1.73Z"/><path d="m2.6 6.08 9.4 4.27 9.4-4.27M12 22V10.35"/></svg>
                    </span>
                    <span class="text-xl font-bold tracking-wider text-slate-900">Makemake</span>
                </a>
                <nav class="hidden md:flex items-center gap-8" aria-label="メインナビゲーション">${navLinks}</nav>
                <div class="flex items-center gap-4">
                    <a href="/contact/" class="hidden md:flex text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors">お問い合わせ</a>
                    <a href="/diagnosis/" class="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">売上構造診断 <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
                </div>
            </div>
        </header>`;

    const mountHeader = function () {
        const pageHeader = document.querySelector('body > header');
        if (pageHeader) {
            pageHeader.outerHTML = headerMarkup;
            return;
        }
        document.body.insertAdjacentHTML('afterbegin', headerMarkup);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountHeader, { once: true });
    } else {
        mountHeader();
    }
}());
