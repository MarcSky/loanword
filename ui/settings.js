import {
  $,
  ACTIONS,
  CATEGORY,
  LANGUAGES,
  LEVELS,
  MODE_LABEL,
  SESSION_LENGTHS,
  UI_LANG,
  api,
  app,
  applyTheme,
  esc,
  icon,
  languageName,
  levelBlurb,
  refresh,
  registerScreen,
  render,
  saveSetting,
  t,
  toast,
} from './core.js';
import { deckChips } from './overview.js';

const THEMES = [
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon-stars' },
  { value: 'system', icon: 'monitor' },
];

const PEEK_POOLS = [
  ['starred', 'Starred'],
  ['slipping', 'Slipping away'],
  ['leech', 'Fought back'],
  ['new', 'Never seen'],
];

const EXERCISES = [
  ['flashcards', 'Flashcards', 'Recall on your own and grade yourself against FSRS.'],
  ['learn', 'Learn', 'Four candidates from the same domain; the click is graded for you.'],
  ['cloze', 'Cloze', 'The example sentence with the word taken out.'],
  ['type', 'Type it', 'Write the word from the meaning — one typo forgiven in a long word.'],
  ['reverse', 'Reverse', 'From your language to the one you are learning.'],
];

export const HELP = {
  decks: () => [t('Language profiles'), t('Each pair is its own deck, with its own cards and its own schedule. Opening another one never touches the first. The switch says whether today’s prompts are captured into that language; every language left on fills its own queue, and they never wait on each other.')],
  ui: () => [t('Interface language'), t('Separate from what you are learning. Changing your target language never changes this.')],
  clone: () => [t('Copying a deck'), t('The concepts travel: your own phrasing, the domain, the level, the star. The new side is written fresh and starts from zero — no schedule is ever copied, and the deck you copy from is not touched.')],
  mode: () => [t('What gets captured'), t('<b>Active</b> takes your own prompts and shows how a native speaker would have put it. <b>Passive</b> takes unfamiliar words out of the assistant’s replies. <b>Both</b> does each.')],
  level: () => [t('Floor level'), t('Words below this CEFR level never become cards. Leave it open if you want everything.')],
  autoBuild: () => [t('Building at session end'), t('When a work session leaves ten or more captured records behind, the cards are built in the background.')],
  echo: () => [t('Echo'), t('<b>One line</b> opens every reply with the phrasing a native speaker would have used. <b>Weave</b> also asks Claude to work your ten weakest words into the answer. Both spend a line of every response.')],
  dailyLimit: () => [t('New cards per day'), t('A cap on unseen cards only. Reviews that are due are never held back — those are the ones that decay.')],
  weeklyGoal: () => [t('Days a week'), t('The streak asks for a rhythm, not a run. Miss a Tuesday and nothing resets — the week is still there to be met.')],
  intervals: () => [t('Next interval'), t('“Good · 4 d” instead of “got it”. Seeing the consequence makes the choice honest.')],
  peek: () => [t('A card while Claude works'), t('Every prompt starts a wait. Loanword prints one card into the session while it lasts. Nothing is graded; it is a glance, not a test.')],
  picks: () => [t('Which words to show'), t('Pick any mix. The states are combined — starred <b>or</b> slipping — and the levels narrow whatever that leaves. Choose nothing and every card is fair game.')],
  speech: () => [t('Speech'), t('Offline voices only: your browser’s local ones first, then Piper, <code>say</code> or eSpeak NG on this machine. Nothing is ever sent anywhere.')],
  produce: () => [t('One sentence of your own'), t('The summary asks for a sentence using two of today’s words and answers with one line. The sentence itself is never stored.')],
  exercises: () => [t('Exercises'), t('Which questions the planner may ask. It picks by how well a card is known — recognition while it is new, production once it holds.')],
  studyMode: () => [t('Default mode'), t('<b>Flashcards</b> asks you to recall and grade yourself. <b>Learn</b> offers four candidates and grades the click for you.')],
  export: () => [t('Export to Anki'), t('Anki → File → Import, field separator “;”, fields front, back, reading, example, tags.')],
  data: () => [t('Where your deck lives'), t('One SQLite file, <code>loanword.db</code>, in the plugin data directory, with <code>settings.json</code> and the capture queues beside it. Copy it while the trainer is closed and you have a backup.')],
  privacy: () => [t('Privacy'), t('Secrets are scrubbed before anything is written, code and tool output are never captured, and the trainer binds <code>127.0.0.1</code> only. No accounts, no telemetry.')],
};

const langOptions = (selected, exclude = '') =>
  LANGUAGES.filter(([code]) => code !== exclude)
    .map(
      ([code, name]) =>
        `<option value="${code}" ${code === selected ? 'selected' : ''}>${esc(name)} · ${code}</option>`,
    )
    .join('');

const helpDot = (key) =>
  HELP[key]
    ? `<button class="help-dot" data-act="help" data-value="${key}"
        aria-label="${esc(t('What {name} does', { name: HELP[key]()[0] }))}">
        ${icon('warning-circle', 'icon-sm icon')}
      </button>`
    : '';

function setting(title, control, { help = '', hint = '' } = {}) {
  return `<div class="setting">
    <div class="setting-copy">
      <div class="t">${esc(title)}${helpDot(help)}</div>
      ${hint ? `<div class="d">${esc(hint)}</div>` : ''}
    </div>
    <div class="setting-control">${control}</div>
  </div>`;
}

function cloneBlock(cfg) {
  const sources = (app.pairs || []).filter(
    (pair) => pair.native === cfg.native && pair.target !== cfg.target && pair.total > 0,
  );
  if (!sources.length) return '';
  const starter = app.cards.length ? null : app.starter;

  return `<form class="clone" data-clone>
    <div class="clone-head">
      <span>${esc(t('Copy into {lang}', { lang: languageName(cfg.target) }))}</span>
      ${helpDot('clone')}
    </div>
    <label class="field">
      <span class="field-label">${esc(t('From'))}</span>
      <select class="select" name="from">
        ${sources
          .map(
            (pair) =>
              `<option value="${pair.target}">${esc(languageName(pair.target))} · ${pair.total}</option>`,
          )
          .join('')}
      </select>
    </label>
    <div class="filters" role="group" aria-label="${esc(t('Filter by category'))}">
      ${Object.keys(CATEGORY)
        .map(
          (key) => `<label class="chip chip-sm"><input type="checkbox" name="category" value="${key}"
            ${starter?.categories.includes(key) ? 'checked' : ''}> ${esc(t(CATEGORY[key].label))}</label>`,
        )
        .join('')}
    </div>
    <div class="filters" role="group" aria-label="${esc(t('Filter by CEFR level'))}">
      ${LEVELS.map(
        (level) => `<label class="chip chip-sm"><input type="checkbox" name="level" value="${level}"
          ${starter?.levels.includes(level) ? 'checked' : ''}> ${level}</label>`,
      ).join('')}
    </div>
    <button class="btn btn-primary" type="submit">${icon('cards-three', 'icon-sm icon')} ${esc(t('Copy'))}</button>
  </form>`;
}

const choices = (setting_, values, current) =>
  `<select class="select" data-setting="${setting_}">
    ${values
      .map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${esc(t(label))}</option>`)
      .join('')}
  </select>`;

function renderSettings() {
  const cfg = app.config;
  const enabled = Array.isArray(cfg.exercises) ? cfg.exercises : EXERCISES.map(([key]) => key);

  $('#page-settings').innerHTML = `
    <div class="page-head"><h1>${esc(t('Settings'))}</h1></div>

    <div class="settings">
      <section class="panel settings-group"><h2 class="title">${esc(t('Languages'))}</h2>
      <div class="lang-pair">
        <label class="field">
          <span class="field-label">${esc(t('You write prompts in'))}</span>
          <select class="select" data-setting="native">${langOptions(cfg.native)}</select>
        </label>
        <button class="swap" data-act="swap-langs" aria-label="${esc(t('Swap the two languages'))}">
          ${icon('arrows-left-right', 'icon-sm icon')}
        </button>
        <label class="field">
          <span class="field-label">${esc(t('You are learning'))}</span>
          <select class="select" data-setting="target">${langOptions(cfg.target, cfg.native)}</select>
        </label>
      </div>

      <div class="decks-head">
        <span>${esc(t('Your decks'))}</span>
        ${helpDot('decks')}
      </div>
      <div class="decks">${deckChips()}</div>

      ${cloneBlock(cfg)}

      ${setting(t('Interface language'), `<select class="select" data-setting="uiLang">
          ${['en', ...(app.uiLanguages || [])]
            .filter((code, index, all) => all.indexOf(code) === index)
            .map(
              (code) =>
                `<option value="${code}" ${UI_LANG === code ? 'selected' : ''}>${esc(languageName(code))}</option>`,
            )
            .join('')}
        </select>`, { help: 'ui' })}

      </section><section class="panel settings-group"><h2 class="title">${esc(t('Capture'))}</h2>
      ${setting(
        t('What gets captured'),
        choices('mode', [['active', 'active'], ['passive', 'passive'], ['both', 'both']], cfg.mode),
        { help: 'mode' },
      )}
      ${setting(
        t('Floor level'),
        `<select class="select" data-setting="level">
          <option value="" ${!cfg.level ? 'selected' : ''}>${esc(t('No floor'))}</option>
          ${LEVELS.map(
            (level) =>
              `<option value="${level}" ${cfg.level === level ? 'selected' : ''}>${level} · ${esc(levelBlurb(level))}</option>`,
          ).join('')}
        </select>`,
        { help: 'level' },
      )}
      ${setting(
        t('Build at session end'),
        `<button class="switch" role="switch" data-setting="autoBuild" aria-checked="${!!cfg.autoBuild}"
          aria-label="${esc(t('Build at session end'))}"></button>`,
        { help: 'autoBuild' },
      )}
      ${setting(
        t('Echo the native phrasing'),
        choices('echo', [['off', 'Off'], ['line', 'One line'], ['weave', 'Weave my weakest words in']], cfg.echo || 'off'),
        { help: 'echo' },
      )}

      </section><section class="panel settings-group"><h2 class="title">${esc(t('Study'))}</h2>
      ${setting(
        t('New cards per day'),
        `<input class="input" type="number" min="3" max="50" step="1" value="${cfg.dailyLimit}" data-setting="dailyLimit">`,
        { help: 'dailyLimit' },
      )}
      ${setting(
        t('Session length'),
        `<div class="segmented" role="group" aria-label="${esc(t('Session length'))}">
          ${SESSION_LENGTHS.map(
            (minutes) => `<button data-act="set-minutes" data-value="${minutes}"
              aria-pressed="${(cfg.sessionMinutes || 10) === minutes}">${minutes} ${esc(t('min'))}</button>`,
          ).join('')}
        </div>`,
      )}
      ${setting(
        t('Days a week'),
        `<input class="input" type="number" min="1" max="7" step="1" value="${cfg.weeklyGoal ?? 5}" data-setting="weeklyGoal">`,
        { help: 'weeklyGoal' },
      )}
      ${setting(
        t('Show the next interval'),
        `<button class="switch" role="switch" data-setting="showIntervals" aria-checked="${cfg.showIntervals !== false}"
          aria-label="${esc(t('Show the next interval'))}"></button>`,
        { help: 'intervals' },
      )}
      ${setting(
        t('Exercises'),
        `<div class="filters" role="group" aria-label="${esc(t('Exercises'))}">
          ${EXERCISES.map(
            ([key, label, blurb]) => `<button class="chip chip-sm" data-act="toggle-exercise" data-value="${key}"
              aria-pressed="${enabled.includes(key)}" title="${esc(t(blurb))}">${esc(t(label))}</button>`,
          ).join('')}
        </div>`,
        { help: 'exercises' },
      )}
      ${setting(
        t('Default mode'),
        `<div class="segmented" role="group" aria-label="${esc(t('Default study mode'))}">
          ${['flashcards', 'learn']
            .map(
              (mode) => `<button data-act="study-mode" data-value="${mode}" aria-pressed="${cfg.studyMode === mode}">
                ${esc(t(MODE_LABEL[mode]))}</button>`,
            )
            .join('')}
        </div>`,
        { help: 'studyMode' },
      )}
      ${setting(
        t('Say it out loud'),
        choices('speech', [['off', 'Off'], ['reveal', 'On reveal'], ['ask', 'Also at the start of Type it']], cfg.speech || 'reveal'),
        { help: 'speech' },
      )}
      ${setting(
        t('One sentence of your own'),
        `<button class="switch" role="switch" data-setting="produce" aria-checked="${cfg.produce !== false}"
          aria-label="${esc(t('One sentence of your own'))}"></button>`,
        { help: 'produce' },
      )}
      ${setting(
        t('A card while Claude works'),
        `<div class="control-pair">
          <button class="switch" role="switch" data-setting="peek" aria-checked="${cfg.peek === 'on'}"
            aria-label="${esc(t('A card while Claude works'))}"></button>
          <label class="every">
            <input class="input" type="number" min="1" max="120" step="1" value="${cfg.peekEvery ?? 15}"
              data-setting="peekEvery" aria-label="${esc(t('Minutes between cards'))}">
            <span>${esc(t('min'))}</span>
          </label>
        </div>`,
        { help: 'peek' },
      )}
      ${
        cfg.peek === 'on'
          ? setting(
              t('Which words to show'),
              `<div class="picks">
                <div class="filters" role="group" aria-label="${esc(t('Which words to show'))}">
                  ${PEEK_POOLS.map(
                    ([key, label]) => `<button class="chip chip-sm" data-act="toggle-pick" data-value="${key}"
                      aria-pressed="${(cfg.peekPick || []).includes(key)}">${esc(t(label))}</button>`,
                  ).join('')}
                </div>
                <div class="filters" role="group" aria-label="${esc(t('Filter by CEFR level'))}">
                  ${LEVELS.map(
                    (level) => `<button class="chip chip-sm" data-act="toggle-pick" data-value="${level}"
                      aria-pressed="${(cfg.peekPick || []).includes(level)}">${level}</button>`,
                  ).join('')}
                </div>
              </div>`,
              {
                help: 'picks',
                hint: (cfg.peekPick || []).length
                  ? t('{n} cards match', { n: app.peekMatches ?? 0 })
                  : t('Everything'),
              },
            )
          : ''
      }

      </section><section class="panel settings-group"><h2 class="title">${esc(t('Appearance'))}</h2>
      ${setting(
        t('Theme'),
        `<div class="segmented" role="group" aria-label="${esc(t('Theme'))}">
          ${THEMES.map(
              ({ value, icon: ic }) => `<button data-act="theme-set" data-value="${value}"
                aria-pressed="${cfg.theme === value}" aria-label="${esc(t(value))}">${icon(ic, 'icon-sm icon')}</button>`,
            )
            .join('')}
        </div>`,
      )}

      </section><section class="panel settings-group"><h2 class="title">${esc(t('Your data'))}</h2>
      ${setting(
        t('Export to Anki'),
        `<button class="btn" data-act="export">${icon('download-simple', 'icon-sm icon')} ${esc(t('Export'))}</button>`,
        { help: 'export' },
      )}
      ${setting(
        t('Where your deck lives'),
        `<code class="path">loanword.db</code>`,
        { help: 'data' },
      )}
      ${setting(
        t('Privacy'),
        `<a class="btn" href="https://github.com/MarcSky/loanword" target="_blank" rel="noopener">
          ${icon('book-open', 'icon-sm icon')} ${esc(t('The rules'))}</a>`,
        { help: 'privacy' },
      )}
    </section></div>`;
}

Object.assign(ACTIONS, {
  help: (key) => {
    if (!HELP[key]) return;
    const [title, body] = HELP[key]();
    $('#help-title').textContent = title;
    $('#help-body').innerHTML = body;
    $('#help').showModal();
  },
  'close-help': () => $('#help').close(),
  'study-mode': async (value) => {
    await saveSetting('studyMode', value);
    render();
  },
  'set-minutes': async (value) => {
    await saveSetting('sessionMinutes', Number(value));
    render();
  },
  'toggle-pick': async (value) => {
    const current = Array.isArray(app.config.peekPick) ? app.config.peekPick : [];
    const next = current.includes(value) ? current.filter((key) => key !== value) : [...current, value];
    await saveSetting('peekPick', next);
    render();
  },
  'toggle-exercise': async (value) => {
    const current = Array.isArray(app.config.exercises) ? app.config.exercises : EXERCISES.map(([key]) => key);
    const next = current.includes(value) ? current.filter((key) => key !== value) : [...current, value];
    if (!next.length) return toast(t('At least one exercise has to stay on'), 'error');
    await saveSetting('exercises', next);
    render();
  },
  'theme-set': async (value) => {
    applyTheme(value);
    await saveSetting('theme', value);
    render();
  },
  theme: async () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await saveSetting('theme', next);
    if (app.route === 'settings') render();
  },
  'swap-langs': async () => {
    const { native, target } = app.config;
    app.config = await api('/settings', { native: target, target: native });
    app.category = '';
    app.level = '';
    app.session = null;
    await refresh();
    toast(t('Now {from} → {to}', { from: languageName(app.config.native), to: languageName(app.config.target) }));
  },
  'open-deck': async (value) => {
    const [native, target] = String(value).split('>');
    if (native === app.config.native && target === app.config.target) return;
    app.config = await api('/settings', { native, target });
    app.category = '';
    app.level = '';
    app.session = null;
    await refresh();
    toast(t('Now studying {lang}', { lang: languageName(app.config.target) }));
  },
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-clone]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const button = form.querySelector('button[type=submit]');
  if (button) button.disabled = true;
  try {
    const out = await api('/clone', {
      from: data.get('from'),
      to: app.config.target,
      categories: data.getAll('category'),
      levels: data.getAll('level'),
    });
    toast(t('{n} cards queued for {lang}', { n: out.queued, lang: languageName(out.to) }));
    await refresh();
  } catch (error) {
    toast(error.message || t('Could not copy that deck'), 'error');
    if (button) button.disabled = false;
  }
});

registerScreen('settings', renderSettings);

export { renderSettings };
