/*
 * Shared GA4 measurement for the public site.
 * Event parameters intentionally exclude form fields and other personal data.
 */
(function () {
    const measurementId = 'G-4BL0WG5Y3T';
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);

    const sendEvent = function (eventName, parameters) {
        window.gtag('event', eventName, Object.assign({
            page_path: window.location.pathname
        }, parameters || {}));
    };

    document.addEventListener('click', function (event) {
        const diagnosisLink = event.target.closest('a[href="/diagnosis/"], a[href="/diagnosis"]');
        if (diagnosisLink) {
            sendEvent('diagnosis_cta_click', {
                link_text: diagnosisLink.textContent.trim().slice(0, 100)
            });
        }

        const diagnosisChoice = event.target.closest('[data-diagnosis]');
        if (diagnosisChoice) {
            sendEvent('theory_self_diagnosis_select', {
                diagnosis_area: diagnosisChoice.dataset.diagnosis
            });
        }
    });

    document.addEventListener('submit', function (event) {
        if (event.target.matches('form[action*="formspree.io"]')) {
            sendEvent('diagnosis_form_submit');
        }
    });

    if (window.location.pathname === '/thanks-diagnosis/') {
        sendEvent('generate_lead');
    }
}());
