chrome.storage.local.get('behavior', response => {
    let behavior = response.behavior || 'hover';
    document.querySelector(`#options > span[data-behavior=${behavior}]`).classList.add('active');
    document.querySelectorAll('#options > span').forEach(el => el.addEventListener('click', e => {
        let newBehavior = e.target.dataset.behavior;
        if (newBehavior !== behavior) {
            chrome.runtime.sendMessage({'behavior': newBehavior});
        }
        window.close();
    }));
});
