import {
  $,
  ACTIONS,
  RENDER,
  ROUTES,
  SHORTCUTS,
  app,
  applyTheme,
  esc,
  go,
  load,
  loadLanguage,
  readAnalyticsHash,
  render,
  saveSetting,
  t,
} from './core.js';
import { bindTips, hideTip } from './charts.js';
import { railOpen } from './shell.js';
import { setRail } from './core.js';

const storedRail = (() => {
  try {
    return localStorage.getItem('rail');
  } catch {
    return null;
  }
})();
document.documentElement.dataset.rail = railOpen(innerWidth, storedRail) ? 'open' : 'closed';
import './overview.js';
import './deck.js';
import './study.js';
import './analytics.js';
import './settings.js';
import { renderDeck } from './deck.js';
import { studyKeys } from './study.js';
import { loadAnalytics } from './analytics.js';
import { watchBuild } from './overview.js';

function renderShortcuts() {
  $('#shortcuts h2').textContent = t('Keyboard');
  $('#shortcut-list').innerHTML = SHORTCUTS()
    .map(
      ([keys, what]) =>
        `<dt style="text-align:end">${keys.split(' ').map((key) => `<kbd>${esc(key)}</kbd>`).join('')}</dt>
         <dd style="margin:0;color:var(--ink-2)">${esc(what)}</dd>`,
    )
    .join('');
}

Object.assign(ACTIONS, {
  go: (value) => go(value),
  shortcuts: () => $('#shortcuts').showModal(),
  'close-shortcuts': () => $('#shortcuts').close(),
  rail: () => setRail(document.documentElement.dataset.rail === 'closed'),
  drawer: () => {
    $('#drawer').open = true;
  },
});

$('#drawer').addEventListener('click', (event) => {
  if (event.target.closest('[data-act="go"]')) $('#drawer').open = false;
});
$('#drawer').addEventListener('wa-after-hide', () => $('.burger')?.focus());

document.addEventListener('click', (event) => {
  const switcher = $('#switcher');
  if (switcher?.open && !event.target.closest('#switcher')) switcher.open = false;
  const trigger = event.target.closest('[data-act]');
  if (!trigger || trigger.getAttribute('aria-disabled') === 'true') return;
  const handler = ACTIONS[trigger.dataset.act];
  if (handler) {
    event.preventDefault();
    handler(trigger.dataset.value);
  }
});

document.addEventListener('input', (event) => {
  const field = event.target;
  if (field.id === 'deck-search') {
    app.deck.query = field.value;
    renderDeck();
    $('#deck-search').focus();
    return;
  }
  if (field.id === 'typed') {
    if (app.session) app.session.typed = field.value;
    return;
  }
  if (!field.dataset.setting) return;
  const key = field.dataset.setting;
  const numeric = key === 'dailyLimit' || key === 'weeklyGoal' || key === 'peekEvery';
  const value = numeric ? Number(field.value) : field.value;
  if (value === app.config[key]) return;
  saveSetting(key, value).then(async () => {
    if (key === 'uiLang') {
      await loadLanguage();
      renderShortcuts();
      render();
      return;
    }
    if (key === 'native' || key === 'target') {
      app.category = '';
      app.level = '';
      app.session = null;
      const { refresh } = await import('./core.js');
      await refresh();
    }
  });
});

document.addEventListener('click', async (event) => {
  const toggle = event.target.closest('[role="switch"][data-setting]');
  if (!toggle) return;
  const next = toggle.getAttribute('aria-checked') !== 'true';
  toggle.setAttribute('aria-checked', String(next));
  await saveSetting(toggle.dataset.setting, next);
  if (app.route === 'settings') render();
});

addEventListener('keydown', (event) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);

  if (event.key === '?' && !typing) return ACTIONS.shortcuts();
  if (event.key === 'Escape') {
    if ($('#help').open) return ACTIONS['close-help']();
    if ($('#shortcuts').open) return ACTIONS['close-shortcuts']();
    hideTip();
    if (app.deck.editing) return ACTIONS['edit-cancel']();
  }

  if (app.route === 'study' && !(typing && event.key !== 'Enter' && event.key !== 'Escape')) {
    if (studyKeys(event)) return;
  }

  if (typing) return;
  if (event.key === '/') {
    event.preventDefault();
    if (app.route !== 'deck') go('deck');
    return $('#deck-search')?.focus();
  }
  if (event.key.toLowerCase() === 't') return ACTIONS.theme();
  if (event.key === '[') return ACTIONS.rail();
  if (app.route === 'study' && app.session) return;
  const index = Number(event.key);
  if (index >= 1 && index <= ROUTES.length) go(ROUTES[index - 1].id);
});

addEventListener('hashchange', async () => {
  const hash = location.hash.replace(/^#\/?/, '');
  const [route] = hash.split('?');
  app.route = RENDER[route] ? route : 'overview';
  if (app.route === 'analytics') {
    readAnalyticsHash(location.hash);
    if (!app.analytics.data && !app.analytics.loading) {
      render();
      await loadAnalytics();
    }
  }
  render();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (app.config.theme === 'system' || !app.config.theme) applyTheme('system');
});

for (const id of ['shortcuts', 'help']) {
  $(`#${id}`).addEventListener('click', (event) => {
    if (event.target.id === id) $(`#${id}`).close();
  });
}

bindTips(document);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

try {
  await loadLanguage();
  renderShortcuts();
  await load();
  const hash = location.hash.replace(/^#\/?/, '');
  const [route] = hash.split('?');
  app.route = RENDER[route] ? route : 'overview';
  if (app.route === 'analytics') readAnalyticsHash(location.hash);
  render();
  watchBuild();
  if (app.route === 'analytics') {
    await loadAnalytics();
    render();
  }
} catch (error) {
  $('#main').innerHTML = `<div class="page" data-active><div class="empty">
    <h2>${t('The trainer could not reach its own server')}</h2>
    <p>${esc(error.message)}. ${t('Restart it with <code>/loanword:review</code>.')}</p>
  </div></div>`;
}
