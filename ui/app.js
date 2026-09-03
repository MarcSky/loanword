import {
  $,
  ACTIONS,
  RENDER,
  ROUTES,
  SHORTCUTS,
  app,
  applyTheme,
  emptyState,
  esc,
  go,
  load,
  loadLanguage,
  modal,
  readAnalyticsHash,
  render,
  saveSetting,
  t,
} from './core.js';
import { bindTips, hideTip } from './charts.js';
import { railOpen, railState } from './shell.js';
import { setRail } from './core.js';

const storedRail = (() => {
  try {
    return localStorage.getItem('rail');
  } catch {
    return null;
  }
})();
document.documentElement.dataset.rail = railState(railOpen(innerWidth, storedRail));
import './overview.js';
import './deck.js';
import './study.js';
import './practice.js';
import './analytics.js';
import './settings.js';
import { renderDeck } from './deck.js';
import { studyKeys } from './study.js';
import { practiceKeys } from './practice.js';
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
  'pick-ui-lang': async (code) => {
    const menu = $('#ui-switcher');
    if (menu) menu.open = false;
    if ((app.config.uiLang || 'en') === code) return;
    await saveSetting('uiLang', code);
    await loadLanguage();
    renderShortcuts();
    render();
  },
  drawer: () => {
    $('#drawer').open = true;
  },
});

$('#drawer').addEventListener('click', (event) => {
  if (event.target.closest('[data-act="go"]')) $('#drawer').open = false;
});
$('#drawer').addEventListener('wa-after-hide', () => $('.burger')?.focus());

document.addEventListener('click', (event) => {
  for (const open of document.querySelectorAll('details.switcher[open]')) {
    if (!open.contains(event.target)) open.open = false;
  }
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

  if ((event.key === 'Enter' || event.key === ' ') && !typing) {
    const row = event.target.closest?.('[role="button"][data-act]');
    if (row) {
      event.preventDefault();
      ACTIONS[row.dataset.act]?.(row.dataset.value);
      return;
    }
  }

  if (event.key === '?' && !typing) return ACTIONS.shortcuts();
  if (event.key === 'Escape') {
    if ($('#help').open) return ACTIONS['close-help']();
    if ($('#shortcuts').open) return ACTIONS['close-shortcuts']();
    hideTip();
    if (app.deck.editing) return ACTIONS['edit-cancel']();
  }

  if (app.route === 'practice' && practiceKeys(event)) return event.preventDefault();

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

modal('shortcuts');
modal('help');

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
} catch {
  $('#main').innerHTML = `<div class="page" data-active>${emptyState({
    art: {
      src: 'offline-error.webp',
      alt: 'Flat line illustration: a laptop with its cable unplugged, a person leaning in to look; thin black outline, blue and beige fills, white background, no text',
    },
    title: t('The trainer is not running'),
    body: t('Start it with <code>loanword</code> in a terminal, or <code>/loanword:review</code> in Claude Code. This page reconnects on its own.'),
  })}</div>`;
  const again = setInterval(async () => {
    try {
      const reply = await fetch('/state', { cache: 'no-store' });
      if (reply.ok) {
        clearInterval(again);
        location.reload();
      }
    } catch {}
  }, 3000);
}
