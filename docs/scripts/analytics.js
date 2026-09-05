/*
 * Shared GA4 measurement for the public site.
 * Event parameters intentionally exclude form fields and other personal data.
 */
(function () {
    const measurementId = 'G-4BL0WG5Y3T';
    // Add ?internal_check=1 only to deliberate production verification URLs.
    // It is intentionally opt-in so ordinary visitors retain normal GA4 data.
    const isInternalCheck = new URLSearchParams(window.location.search).get('internal_check') === '1';
    const internalTrafficParameters = isInternalCheck ? { traffic_type: 'internal' } : {};
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, internalTrafficParameters);

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);

    const sendEvent = function (eventName, parameters) {
        window.gtag('event', eventName, Object.assign({
            page_path: window.location.pathname
        }, internalTrafficParameters, parameters || {}));
    };

    const pendingFormKey = 'makemake_pending_form_submission';
    const rememberPendingForm = function (formType) {
        try {
            window.sessionStorage.setItem(pendingFormKey, formType);
        } catch (_) {
            // A blocked storage area must not prevent the native form submit.
        }
    };
    const consumePendingForm = function () {
        try {
            const formType = window.sessionStorage.getItem(pendingFormKey);
            window.sessionStorage.removeItem(pendingFormKey);
            return formType;
        } catch (_) {
            return null;
        }
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

        const submitButton = event.target.closest('button[type="submit"][data-analytics-submit]');
        const formType = submitButton && submitButton.form && submitButton.form.dataset.analyticsForm;
        if (formType) {
            // This intentionally counts an actual button press, including a
            // press that is stopped by browser validation before submission.
            sendEvent(formType + '_submit_click', { form_type: formType });
        }
    });

    document.addEventListener('submit', function (event) {
        const formType = event.target.dataset.analyticsForm;
        if (formType) {
            // The completion event is emitted only after Formspree returns to
            // the matching thank-you page, never with any form-field value.
            rememberPendingForm(formType);
        }
    });

    const completionByPath = {
        '/thanks-diagnosis/': 'diagnosis',
        '/thanks-contact/': 'contact'
    };
    const completedFormType = completionByPath[window.location.pathname];
    if (completedFormType && consumePendingForm() === completedFormType) {
        sendEvent(completedFormType + '_submission_success', { form_type: completedFormType });
    }
}());
