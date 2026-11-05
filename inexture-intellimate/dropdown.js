// Custom list on top of the native #projectDropdown so options fit inside the popup.
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('projectDropdown');
    if (!select) return;

    const wrap = document.createElement('div');
    wrap.className = 'dd';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn';
    const label = document.createElement('span');
    label.className = 'dd-label';
    const chevron = document.createElement('span');
    chevron.className = 'dd-chevron';
    btn.append(label, chevron);
    const list = document.createElement('ul');
    list.className = 'dd-list';
    list.hidden = true;
    wrap.append(btn, list);
    select.after(wrap);

    function close() {
        list.hidden = true;
        wrap.classList.remove('open');
    }

    function pick(i) {
        select.selectedIndex = i;
        select.dispatchEvent(new Event('change'));
        close();
        render();
    }

    function render() {
        const current = select.options[select.selectedIndex];
        label.textContent = current ? current.textContent : '';
        btn.title = label.textContent;
        btn.disabled = select.disabled;
        wrap.style.display = select.style.display === 'none' ? 'none' : '';

        list.innerHTML = '';
        Array.from(select.options).forEach((o, i) => {
            const li = document.createElement('li');
            li.className = 'dd-item' + (i === select.selectedIndex ? ' selected' : '');
            if (o.dataset.project) {
                const project = document.createElement('div');
                project.className = 'dd-project';
                project.textContent = o.dataset.project;
                const task = document.createElement('div');
                task.className = 'dd-task';
                task.textContent = o.dataset.task;
                li.append(project, task);
            } else {
                li.textContent = o.textContent;
            }
            li.addEventListener('click', () => pick(i));
            list.appendChild(li);
        });
    }

    btn.addEventListener('click', () => {
        if (!list.hidden) return close();
        render();
        list.hidden = false;
        wrap.classList.add('open');
        const selected = list.querySelector('.selected');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    select.addEventListener('change', render);

    // popup.js rewrites options, disabled and display; keep the custom list in sync.
    new MutationObserver(render).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'style'] });
    render();
});
