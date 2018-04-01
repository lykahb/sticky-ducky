'use strict';
let initialized = false;

vAPI.onPopupOpen(() => vAPI.getSettings('behavior', settings => {
    // // On FF and Chrome popup window is closed. On Safari the window persists. This must be idempotent.
    let behavior = settings.behavior || (DetectIt.deviceType === 'mouseOnly' ? 'hover' : 'scroll');
    if (!settings.behavior) vAPI.updateSettings({behavior: behavior});
    if (!initialized) document.querySelectorAll('#options > span').forEach(el => el.addEventListener('click', e => {
        let newBehavior = e.target.dataset.behavior;
        if (newBehavior !== behavior) {
            behavior = newBehavior;
            vAPI.updateSettings({behavior: behavior});
            vAPI.sendSettings({behavior: behavior});
        }
        vAPI.closePopup();
    }));
    initialized = true;
    let activeOption = document.querySelector(`#options > span.active`);
    if (activeOption) activeOption.classList.remove('active');
    document.querySelector(`#options > span[data-behavior=${behavior}]`).classList.add('active');
}));