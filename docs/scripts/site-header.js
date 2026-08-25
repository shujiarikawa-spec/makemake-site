/* Shared global header. The page body remains responsible for its own content header. */
(function () {
    const brandFontHref = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,700&display=swap';
    const brandStyleId = 'makemake-brand-lockup-styles';

    const installBrandStyles = function () {
        if (!document.querySelector(`link[href="${brandFontHref}"]`)) {
            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = brandFontHref;
            document.head.appendChild(fontLink);
        }
        if (document.getElementById(brandStyleId)) return;

        const styles = document.createElement('style');
        styles.id = brandStyleId;
        styles.textContent = `
            .brand-lockup { display: inline-flex; align-items: center; gap: 9px; color: inherit; text-decoration: none; }
            .brand-lockup:focus-visible { outline: 2px solid #3165dc; outline-offset: 5px; }
            .brand-lockup__mark { width: auto; height: 32px; flex: 0 0 auto; }
            .brand-wordmark { color: #0f172a; font-family: "DM Sans", "Helvetica Neue", Arial, sans-serif; font-size: 20px; font-weight: 700; letter-spacing: -.108em; line-height: .78; white-space: nowrap; }
            .brand-wordmark__m { color: #3165dc; display: inline-block; margin-right: .08em; }
            .brand-wordmark__ake { display: inline-block; margin-left: -.035em; margin-right: -.055em; }
            .brand-wordmark__m--second { margin-left: .08em; }
            .brand-lockup--footer .brand-lockup__mark { height: 24px; }
            .brand-lockup--footer .brand-wordmark { font-size: 18px; }
            .brand-lockup--on-dark .brand-wordmark { color: #fff; }
            .brand-lockup--on-dark .brand-wordmark__m { color: #60a5fa; }
            .makemake-global-footer { align-items: center; background: #f6f2e7; border-top: 1px solid #d7deec; display: flex; min-height: 145px; padding: 48px 0; }
            .makemake-global-footer__inner { align-items: center; display: flex; gap: 24px; justify-content: space-between; margin: 0 auto; width: min(100% - 48px, 1152px); }
            .makemake-global-footer .brand-lockup { color: #102563; }
            .makemake-global-footer .brand-lockup__mark { height: 24px; }
            .makemake-global-footer .brand-wordmark { color: #102563; font-size: 18px; }
            .makemake-global-footer .brand-wordmark__m { color: #1746c9; }
            .makemake-global-footer__links { display: flex; gap: 24px; }
            .makemake-global-footer__links a { color: #52617c; font: 700 14px/1 "DM Sans", "Zen Kaku Gothic New", sans-serif; letter-spacing: -.025em; text-decoration: none; transition: color .2s ease; }
            .makemake-global-footer__links a:hover { color: #102563; }
            .makemake-global-footer__copyright { color: #7685a0; font: 500 11px/1.6 "DM Sans", "Zen Kaku Gothic New", sans-serif; margin: 0; white-space: nowrap; }
            @media (max-width: 767px) {
                .brand-lockup__mark { height: 28px; }
                .brand-wordmark { font-size: 18px; }
                .makemake-global-footer { min-height: 0; padding: 42px 0; }
                .makemake-global-footer__inner { flex-direction: column; gap: 20px; justify-content: center; text-align: center; width: min(100% - 40px, 560px); }
                .makemake-global-footer__links { flex-wrap: wrap; gap: 16px 24px; justify-content: center; }
                .makemake-global-footer__links a { font-size: 13px; }
                .makemake-global-footer__copyright { font-size: 11px; }
            }
        `;
        document.head.appendChild(styles);
    };

    const installFavicon = function () {
        if (!document.querySelector('link[data-makemake-favicon="icon"]')) {
            const favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.type = 'image/x-icon';
            favicon.href = '/favicon.ico';
            favicon.dataset.makemakeFavicon = 'icon';
            document.head.appendChild(favicon);
        }
        if (!document.querySelector('link[data-makemake-favicon="apple-touch"]')) {
            const appleTouchIcon = document.createElement('link');
            appleTouchIcon.rel = 'apple-touch-icon';
            appleTouchIcon.sizes = '180x180';
            appleTouchIcon.href = '/apple-touch-icon.png';
            appleTouchIcon.dataset.makemakeFavicon = 'apple-touch';
            document.head.appendChild(appleTouchIcon);
        }
    };

    const wordmarkMarkup = function () {
        return `<span class="brand-wordmark" aria-hidden="true"><span class="brand-wordmark__m">M</span><span class="brand-wordmark__ake">ake</span><span class="brand-wordmark__m brand-wordmark__m--second">m</span><span class="brand-wordmark__ake">ake</span></span>`;
    };

    const brandLockupMarkup = function (options) {
        const footerClass = options.footer ? ' brand-lockup--footer' : '';
        const contrastClass = options.dark ? ' brand-lockup--on-dark' : '';
        return `<a href="/" class="brand-lockup${footerClass}${contrastClass}" aria-label="マケマケ トップページ"><img src="/images/brand/makemake-mark-blue.png" class="brand-lockup__mark" width="45" height="32" alt="" aria-hidden="true">${wordmarkMarkup()}</a>`;
    };

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
                ${brandLockupMarkup({ footer: false, dark: false })}
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

    const globalFooterMarkup = function () {
        return `<div class="makemake-global-footer__inner">
            ${brandLockupMarkup({ footer: true, dark: false })}
            <nav class="makemake-global-footer__links" aria-label="フッターナビゲーション"><a href="/company/">会社概要</a><a href="/privacy/">プライバシーポリシー</a><a href="/contact/">お問い合わせ</a></nav>
            <p class="makemake-global-footer__copyright">© <span data-makemake-footer-year></span> Makemake Inc. All rights reserved.</p>
        </div>`;
    };

    const mountGlobalFooter = function () {
        const footers = Array.from(document.querySelectorAll('footer'));
        const targets = footers.length ? footers : [document.body.appendChild(document.createElement('footer'))];
        targets.forEach(function (footer) {
            footer.className = 'makemake-global-footer';
            footer.removeAttribute('style');
            footer.innerHTML = globalFooterMarkup();
        });
        document.querySelectorAll('[data-makemake-footer-year]').forEach(function (year) {
            year.textContent = new Date().getFullYear();
        });
    };

    installBrandStyles();
    installFavicon();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            mountHeader();
            mountGlobalFooter();
        }, { once: true });
    } else {
        mountHeader();
        mountGlobalFooter();
    }
}());
