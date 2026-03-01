document.addEventListener("DOMContentLoaded", () => {
    // 1. Lucideアイコンの初期化
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 2. ヘッダーのスクロール変化
    const header = document.getElementById('global-header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                header.classList.add('bg-white/80', 'backdrop-blur-md', 'border-b', 'border-slate-200', 'py-3');
                header.classList.remove('bg-transparent', 'py-6');
            } else {
                header.classList.remove('bg-white/80', 'backdrop-blur-md', 'border-b', 'border-slate-200', 'py-3');
                header.classList.add('bg-transparent', 'py-6');
            }
        });
    }

    // 3. スクロールアニメーション (Intersection Observer)
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                // 一度表示したら監視を解除（1回だけアニメーションさせる場合）
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // .reveal クラスを持つすべての要素を監視
    document.querySelectorAll('.reveal').forEach((el) => {
        observer.observe(el);
    });
});