import {
  $,
  ACTIONS,
  ALL_CATEGORIES,
  CORE,
  FIELDS,
  LANGUAGES,
  LEVELS,
  MODE_LABEL,
  SESSION_LENGTHS,
  UI_LANG,
  api,
  app,
  applyTheme,
  categoriesForField,
  categoriesOf,
  decks,
  dialogHead,
  esc,
  flagOf,
  icon,
  languageName,
  levelBlurb,
  refresh,
  registerScreen,
  render,
  meta,
  modal,
  saveSetting,
  t,
  tintOf,
  tn,
  toast,
} from './core.js';
import { captureSwitches, deckChips, watchBuild } from './overview.js';

const THEMES = [
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon-stars' },
  { value: 'system', icon: 'monitor' },
];

const MODELS = [
  ['haiku', 'Haiku · fast'],
  ['sonnet', 'Sonnet · careful'],
  ['opus', 'Opus · slowest'],
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

const HELP = {
  decks: () => [t('Language profiles'), t('Each pair is its own deck, with its own cards and its own schedule. Opening another one never touches the first. The switch says whether today’s prompts are captured into that language; every language left on fills its own queue, and they never wait on each other.')],
  ui: () => [t('Interface language'), t('Separate from what you are learning. Changing your target language never changes this.')],
  clone: () => [t('Copying a deck'), t('The concepts travel: your own phrasing, the domain, the level, the star. The new side is written fresh and starts from zero — no schedule is ever copied, and the deck you copy from is not touched.')],
  topics: () => [t('Categories'), t('Every card is filed under one category, and the ones you pick here are the only ones the builder may use. Pick a field to set them all at once, or choose by hand. Three are always on: set phrases, connectors and everyday words. Drop a category and the cards it held move to Everyday — file them again to place them properly.')],
  capture: () => [t('Capture into'), t('Which languages today’s prompts are turned into cards for. The queue and the build are per language, so two decks that teach the same language fill from the same capture — turning it off stops both.')],
  mode: () => [t('What gets captured'), t('<b>Active</b> takes your own prompts and shows how a native speaker would have put it. <b>Passive</b> takes unfamiliar words out of the assistant’s replies. <b>Both</b> does each.')],
  level: () => [t('Floor level'), t('Words below this CEFR level never become cards. Leave it open if you want everything.')],
  model: () => [t('Which model writes your cards'), t('Every card is written by a Claude you already have: the trainer runs <code>claude -p</code> on this machine, so nothing is sent anywhere else and no API key is needed. <b>Haiku</b> is fast and cheap and enough for words in a language close to yours. <b>Sonnet</b> is worth it for translating between languages that share no script, and for judging level. <b>Opus</b> for the stubborn cases. The same model answers your one sentence of your own.')],
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

const sourceKey = (source) => source.deck || source.code;

function syncSources() {
  return (app.sync?.sources || []).filter((source) => source.fresh > 0);
}

function syncRow(source) {
  const key = source.deck || source.code;
  const picked = app.sync.picked.has(key);
  return `<div class="sync-row" ${source.fresh ? '' : 'data-empty'}>
    <button class="switch" role="switch" data-act="sync-toggle" data-value="${key}"
      aria-checked="${picked}" aria-label="${esc(languageName(source.code))}"
      ${source.fresh ? '' : 'aria-disabled="true"'}></button>
    <span class="flag">${flagOf(source.code)}</span>
    <span class="sync-lang">${esc(languageName(source.code))}
      ${
        source.translated
          ? `<i class="sync-from">${esc(t('from {lang}', { lang: languageName(source.native) }))}</i>`
          : ''
      }</span>
    <span class="sync-n">${
      source.fresh ? esc(tn(source.fresh, 'new card', 'new cards')) : esc(t('nothing new'))
    }</span>
  </div>`;
}

async function saveCategories(keys, field = 'custom') {
  const saved = await api('/settings', { categories: keys, field }).catch((error) => {
    toast(error.message || t('Could not save'), 'error');
    return null;
  });
  if (!saved) return;
  app.config = saved;
  if (saved.refiled) toast(t('{n} cards moved to Everyday', { n: saved.refiled }));
  else toast(t('Saved'));
  await refresh();
}

function topicChips() {
  const counts = new Map();
  for (const card of app.cards) counts.set(card.category, (counts.get(card.category) || 0) + 1);

  return categoriesOf(app.config.categories)
    .map((key) => {
      const info = meta(key);
      const locked = CORE.includes(key);
      const held = counts.get(key) || 0;
      return `<span class="chip topic-chip" style="${tintOf(key)}" ${locked ? `title="${esc(t('Always on'))}"` : ''}>
        <span class="dot">${icon(info.icon)}</span>${esc(info.label)}
        ${held ? `<b class="topic-n">${held}</b>` : ''}
        ${
          locked
            ? `<span class="topic-lock">${icon('check-circle', 'icon-sm icon')}</span>`
            : `<button class="chip-x" data-act="topics-remove" data-value="${key}"
                aria-label="${esc(t('Remove {name}', { name: info.label }))}">${icon('x', 'icon-sm icon')}</button>`
        }
      </span>`;
    })
    .join('');
}

function renderTopics() {
  const box = $('#topics-body');
  const chosen = app.topics;
  if (!chosen || !box) return;
  const on = new Set(chosen.keys);

  box.innerHTML = `
    ${dialogHead(t('What do you work on?'), 'topics-close')}
    <p class="lede" style="font-size:.9375rem">${esc(
      t('Pick a field and the trainer files your words under it. You can change the list below by hand.'),
    )}</p>

    <div class="fields">
      ${FIELDS.map(
        ([key, label]) => `<button class="chip" data-act="topics-field" data-value="${key}"
          aria-pressed="${chosen.field === key}">${esc(t(label))}</button>`,
      ).join('')}
    </div>

    <div class="topic-grid">
      ${ALL_CATEGORIES.map((key) => {
        const info = meta(key);
        const locked = CORE.includes(key);
        return `<button class="chip topic" data-act="topics-toggle" data-value="${key}"
          aria-pressed="${on.has(key)}" ${locked ? 'aria-disabled="true"' : ''}
          style="${tintOf(key)}" title="${esc(locked ? t('Always on') : info.label)}">
          <span class="dot">${icon(info.icon)}</span>${esc(info.label)}
        </button>`;
      }).join('')}
    </div>

    <div class="sync-foot">
      <span class="field-hint" style="margin-inline-end:auto">${esc(
        tn(categoriesOf(chosen.keys).length, 'category', 'categories'),
      )}</span>
      ${
        app.cards.length
          ? `<button class="btn" data-act="topics-rebuild" ${chosen.busy ? 'disabled' : ''}>
              ${icon('arrows-clockwise', 'icon-sm icon')}
              ${esc(t('File my cards again'))}
            </button>`
          : ''
      }
      <button class="btn btn-primary" data-act="topics-close">${esc(t('Done for now'))}</button>
    </div>`;
}

function renderPair() {
  const box = $('#pair-body');
  const asked = app.adding;
  if (!asked || !box) return;
  const clash = asked.native === asked.target;

  box.innerHTML = `
    ${dialogHead(t('Add a language'), 'pair-close')}
    <p class="lede" style="font-size:.9375rem">${esc(
      t('A deck is a pair: the language you write in and the one you are learning. They can never be the same.'),
    )}</p>

    <div class="lang-pair" style="margin-top:16px">
      <label class="field">
        <span class="field-label">${esc(t('You write prompts in'))}</span>
        <select class="select" id="pair-native">${langOptions(asked.native, asked.target)}</select>
      </label>
      <button class="swap" data-act="pair-swap" aria-label="${esc(t('Swap the two languages'))}">
        ${icon('arrows-left-right', 'icon-sm icon')}
      </button>
      <label class="field">
        <span class="field-label">${esc(t('You are learning'))}</span>
        <select class="select" id="pair-target">${langOptions(asked.target, asked.native)}</select>
      </label>
    </div>

    <p class="field-hint" style="margin-top:10px">${esc(
      t('{from} → {to}', { from: languageName(asked.native), to: languageName(asked.target) }),
    )}</p>

    <div class="sync-foot" style="margin-top:18px">
      <button class="btn" data-act="pair-close">${esc(t('Cancel'))}</button>
      <button class="btn btn-primary" data-act="pair-add" ${clash || asked.busy ? 'disabled' : ''}>
        ${icon('plus', 'icon-sm icon')} ${esc(t('Start this deck'))}
      </button>
    </div>`;
}

function renderDrop() {
  const asked = app.dropping;
  const box = $('#drop-body');
  if (!asked || !box) return;
  const lang = languageName(asked.target);
  box.innerHTML = `
    <div class="section-head" style="margin:0 0 8px">
      <h2>${esc(t('Delete the {lang} deck?', { lang }))}</h2>
    </div>
    <p class="lede" style="font-size:.9375rem">${esc(
      t('{cards} leave your deck, along with what the schedule knew about them. Your review history stays.', {
        cards: tn(asked.total, 'card', 'cards'),
      }),
    )}</p>
    <p class="field-hint">${esc(t('{from} → {to}', { from: languageName(asked.native), to: lang }))}</p>
    <div class="sync-foot">
      <button class="btn" data-act="deck-drop-cancel">${esc(t('Cancel'))}</button>
      <button class="btn btn-danger" data-act="deck-drop-confirm" ${asked.busy ? 'disabled' : ''}>
        ${icon('trash', 'icon-sm icon')} ${esc(t('Delete it'))}
      </button>
    </div>`;
}

function renderSync() {
  const state = app.sync;
  const box = $('#sync-body');
  if (!state || !box) return;
  const chosen = syncSources().filter((source) => state.picked.has(sourceKey(source)));
  const total = chosen.reduce((sum, source) => sum + source.fresh, 0);

  box.innerHTML = `
    ${dialogHead(t('Copy into {lang}', { lang: languageName(app.config.target) }), 'sync-close')}
    <p class="lede" style="font-size:.9375rem">${esc(HELP.clone()[1])}</p>
    ${
      state.loading
        ? `<div class="skeleton" style="height:140px;margin-top:16px"></div>`
        : state.sources.length
          ? `<div class="sync-list">${state.sources.map(syncRow).join('')}</div>`
          : `<p class="field-hint" style="margin-top:16px">${esc(t('nothing new'))}</p>`
    }
    <div class="sync-foot">
      <button class="btn" data-act="sync-close">${esc(t('Cancel'))}</button>
      <button class="btn btn-primary" data-act="sync-run" ${total && !state.busy ? '' : 'disabled'}>
        ${icon('arrows-clockwise', 'icon-sm icon')}
        ${esc(total ? `${t('Copy')} · ${tn(total, 'new card', 'new cards')}` : t('Copy'))}
      </button>
    </div>`;
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

      <div class="decks-head">
        <span>${esc(t('Your decks'))}</span>
        ${helpDot('decks')}
      </div>
      <p class="field-hint" style="margin:-4px 0 10px">${esc(t('Click a deck to study it.'))}</p>
      <div class="decks">${deckChips()}</div>
      <button class="btn" style="margin-top:12px" data-act="pair-open">
        ${icon('plus', 'icon-sm icon')} ${esc(t('Add a language'))}
      </button>

      <div class="decks-head">
        <span>${esc(t('Capture into'))}</span>
        ${helpDot('capture')}
      </div>
      <p class="field-hint" style="margin:-4px 0 10px">${esc(
        t('One switch per language you are learning. Decks that teach the same language share it.'),
      )}</p>
      <div class="decks">${captureSwitches()}</div>

      ${
        (app.pairs || []).some((pair) => pair.total > 0 && !(pair.native === cfg.native && pair.target === cfg.target))
          ? `<button class="btn" style="margin:14px 0 4px" data-act="sync-open">
              ${icon('arrows-clockwise', 'icon-sm icon')} ${esc(t('Copy into {lang}', { lang: languageName(cfg.target) }))}
            </button>`
          : ''
      }

      ${setting(t('Interface language'), `<select class="select" data-setting="uiLang">
          ${['en', ...(app.uiLanguages || [])]
            .filter((code, index, all) => all.indexOf(code) === index)
            .map(
              (code) =>
                `<option value="${code}" ${UI_LANG === code ? 'selected' : ''}>${esc(languageName(code))}</option>`,
            )
            .join('')}
        </select>`, { help: 'ui' })}

      </section><section class="panel settings-group"><h2 class="title">${esc(t('Categories'))}</h2>

      <div class="decks-head">
        <span>${esc(t('What you work on'))}</span>
        ${helpDot('topics')}
      </div>
      <p class="field-hint" style="margin:-4px 0 10px">${esc(
        t('The only categories the builder may use. Drop one and its cards move to Everyday.'),
      )}</p>
      <div class="topic-chips">${topicChips()}</div>
      <div class="topic-actions">
        <button class="btn" data-act="topics-open">
          ${icon('plus', 'icon-sm icon')} ${esc(t('Add a category'))}
        </button>
        ${
          app.cards.length
            ? `<button class="btn" data-act="topics-rebuild">
                ${icon('arrows-clockwise', 'icon-sm icon')} ${esc(t('File my cards again'))}
              </button>`
            : ''
        }
      </div>

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
      ${setting(t('Which model writes your cards'), choices('model', MODELS, cfg.model || 'haiku'), { help: 'model' })}
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
        `<div class="segmented" role="group" aria-label="${esc(t('Days a week'))}">
          ${[1, 2, 3, 4, 5, 6, 7]
            .map(
              (days) => `<button data-act="set-goal" data-value="${days}"
                aria-pressed="${(cfg.weeklyGoal ?? 5) === days}">${days}</button>`,
            )
            .join('')}
        </div>`,
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
  'set-goal': async (value) => {
    await saveSetting('weeklyGoal', Number(value));
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

modal('sync', () => {
  app.sync = null;
});
modal('drop', () => {
  app.dropping = null;
});
modal('pair', () => {
  app.adding = null;
});
modal('topics', () => {
  app.topics = null;
  render();
});

document.addEventListener('change', (event) => {
  const asked = app.adding;
  if (!asked || !event.target.id) return;
  if (event.target.id === 'pair-native') app.adding = { ...asked, native: event.target.value };
  else if (event.target.id === 'pair-target') app.adding = { ...asked, target: event.target.value };
  else return;
  renderPair();
});

Object.assign(ACTIONS, {
  'topics-open': () => {
    app.topics = { keys: categoriesOf(app.config.categories), field: app.config.field || '' };
    $('#topics').showModal();
    renderTopics();
  },
  'topics-close': () => $('#topics').close(),
  'topics-rebuild': async () => {
    const chosen = app.topics;
    if (!chosen || chosen.busy) return;
    chosen.busy = true;
    renderTopics();
    try {
      const out = await api('/categories/rebuild', {});
      $('#topics').close();
      toast(out.started ? t('Filing your cards again') : t('Nothing to file right now'));
      watchBuild();
    } catch (error) {
      chosen.busy = false;
      renderTopics();
      toast(error.message || t('Could not start the build'), 'error');
    }
  },
  'topics-field': async (key) => {
    app.topics = { keys: categoriesForField(key), field: key };
    renderTopics();
    await saveCategories(app.topics.keys, key);
    renderTopics();
  },
  'topics-remove': async (key) => {
    if (CORE.includes(key)) return;
    const keys = categoriesOf(app.config.categories).filter((entry) => entry !== key);
    app.topics = { keys: categoriesOf(keys), field: 'custom' };
    await saveCategories(app.topics.keys);
  },
  'topics-toggle': async (key) => {
    const chosen = app.topics;
    if (!chosen || CORE.includes(key)) return;
    const on = new Set(chosen.keys);
    if (on.has(key)) on.delete(key);
    else on.add(key);
    app.topics = { keys: categoriesOf([...on]), field: 'custom' };
    renderTopics();
    await saveCategories(app.topics.keys);
    renderTopics();
  },
  'pair-open': () => {
    const taken = new Set((app.pairs || []).map((pair) => pair.target));
    const free = LANGUAGES.map(([code]) => code).filter((code) => code !== app.config.native && !taken.has(code));
    app.adding = { native: app.config.native, target: free[0] || app.config.target, busy: false };
    $('#pair').showModal();
    renderPair();
  },
  'pair-close': () => $('#pair').close(),
  'pair-swap': () => {
    const asked = app.adding;
    if (!asked) return;
    app.adding = { ...asked, native: asked.target, target: asked.native };
    renderPair();
  },
  'pair-add': async () => {
    const asked = app.adding;
    if (!asked || asked.busy || asked.native === asked.target) return;
    asked.busy = true;
    renderPair();
    try {
      app.config = await api('/settings', { native: asked.native, target: asked.target });
      $('#pair').close();
      app.category = '';
      app.level = '';
      app.session = null;
      app.duplicates = null;
      await refresh();
      toast(t('Now {from} → {to}', { from: languageName(app.config.native), to: languageName(app.config.target) }));
    } catch (error) {
      asked.busy = false;
      renderPair();
      toast(error.message || t('Could not switch that'), 'error');
    }
  },
  'deck-drop': (value) => {
    const [native, target] = String(value).split('>');
    const pair = decks().find((entry) => entry.native === native && entry.target === target);
    app.dropping = { native, target, total: pair?.total || 0, busy: false };
    $('#drop').showModal();
    renderDrop();
  },
  'deck-drop-cancel': () => $('#drop').close(),
  'deck-drop-confirm': async () => {
    const asked = app.dropping;
    if (!asked || asked.busy) return;
    asked.busy = true;
    renderDrop();
    try {
      const out = await api('/deck/delete', { native: asked.native, target: asked.target });
      $('#drop').close();
      toast(tn(out.removed, 'card removed', 'cards removed'));
      app.duplicates = null;
      await refresh();
    } catch (error) {
      asked.busy = false;
      renderDrop();
      toast(error.message || t('Could not delete that deck'), 'error');
    }
  },
  'sync-open': async () => {
    app.sync = { sources: [], picked: new Set(), loading: true, busy: false };
    $('#sync').showModal();
    renderSync();
    try {
      const out = await api('/clone/sources');
      app.sync.sources = out.sources || [];
      app.sync.picked = new Set(app.sync.sources.filter((source) => source.fresh).map(sourceKey));
    } catch (error) {
      toast(error.message || t('Could not copy that deck'), 'error');
    }
    app.sync.loading = false;
    renderSync();
  },
  'sync-toggle': (key) => {
    const state = app.sync;
    if (!state || state.busy) return;
    if (!state.sources.some((source) => sourceKey(source) === key && source.fresh)) return;
    if (state.picked.has(key)) state.picked.delete(key);
    else state.picked.add(key);
    renderSync();
  },
  'sync-close': () => $('#sync').close(),
  'sync-run': async () => {
    const state = app.sync;
    if (!state || state.busy || !state.picked.size) return;
    state.busy = true;
    renderSync();
    try {
      const out = await api('/clone', { sources: [...state.picked], to: app.config.target });
      $('#sync').close();
      toast(t('{cards} queued for {lang}', { cards: tn(out.queued, 'card', 'cards'), lang: languageName(out.to) }));
      await refresh();
      watchBuild();
    } catch (error) {
      state.busy = false;
      renderSync();
      toast(error.message || t('Could not copy that deck'), 'error');
    }
  },
});

registerScreen('settings', renderSettings);

