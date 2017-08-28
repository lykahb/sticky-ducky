let currentBehavior = 'hover';
chrome.storage.local.get('behavior', response => {
    currentBehavior = response.behavior || currentBehavior;
    getOption(currentBehavior).classList.add('active');
});
let getOption = behavior => document.querySelector(`#options > span[data-behavior=${currentBehavior}]`);

document.querySelectorAll('#options > span').forEach(el => el.addEventListener('click', e => {
    let newBehavior = e.target.dataset.behavior;
    if (newBehavior && currentBehavior !== newBehavior) {
        getOption(currentBehavior).classList.remove('active');
        getOption(newBehavior).classList.add('active');
        chrome.runtime.sendMessage({'behavior': newBehavior});
    }
    window.close();
}));
