import {
  $,
  ACTIONS,
  FLY_MS,
  api,
  app,
  bindSwipe,
  cardById,
  emptyState,
  esc,
  flyCard,
  go,
  icon,
  langAttrs,
  categoryKeys,
  meta,
  pct,
  reducedMotion,
  registerScreen,
  ring,
  t,
  tintOf,
  tn,
  toast,
} from './core.js';
import { checkTyped } from './answer.js';
import { buildChoices, frontOf } from './quiz.js';
import { shuffle } from './plan.js';
import { sayButton, speak } from './speak.js';
import { clampInt } from './limits.js';
import { chapterKey, inChapter, namedChapters, titleOf } from './chapters.js';
import { ANSWER_WITH, DEFAULT_COUNT, TYPES, buildTest, eligibleCards, isAnswered, scoreTest, sortCounts } from './exam.js';

const TABS = [
  ['cards', 'Flashcards', 'cards-three'],
  ['learn', 'Learn mode', 'brain'],
  ['test', 'Test', 'exam'],
];

const KIND_LABEL = { tf: 'True or false', mc: 'Multiple choice', match: 'Matching', written: 'Written' };
const ANSWER_LABEL = { term: 'Term', definition: 'Definition', both: 'Both' };
const CORRECT_MS = 700;

const deckKey = () => `${app.config.native}>${app.config.target}`;

const practice = () => {
  if (!app.practice || app.practice.deck !== deckKey()) {
    app.practice = {
      deck: deckKey(),
      tab: app.practice?.tab || 'cards',
      cards: null,
      learn: null,
      test: null,
      chapter: app.practice?.chapter || '',
      testConfig: { count: DEFAULT_COUNT, answerWith: 'both', types: ['mc'] },
    };
  }
  return app.practice;
};

const scopedCards = () => {
  const key = practice().chapter;
  if (!key) return app.cards;
  const owned = app.cards.filter(inChapter(key));
  return owned.length ? owned : app.cards;
};

const studyPool = () => {
  const scope = scopedCards();
  const open = eligibleCards(scope);
  return open.length ? open : scope;
};

const leftOut = () => {
  const scope = scopedCards();
  return scope.length - eligibleCards(scope).length;
};

function chapterPicker() {
  const rows = namedChapters(app.cards, categoryKeys());
  if (rows.length < 2) return '';
  const wanted = practice().chapter;
  const current = rows.some((row) => chapterKey(row) === wanted) ? wanted : '';
  return `<label class="practice-scope">
    <span class="micro">${esc(t('Chapter'))}</span>
    <select class="select" id="practice-chapter" aria-label="${esc(t('Chapter'))}">
      <option value="">${esc(t('All'))} (${esc(tn(app.cards.length, 'card', 'cards'))})</option>
      ${rows
        .map((row) => {
          const key = chapterKey(row);
          return `<option value="${esc(key)}" ${current === key ? 'selected' : ''}>${esc(meta(row.category).label)} · ${esc(
            titleOf(row.topic) || t('Unsorted'),
          )} (${row.n})</option>`;
        })
        .join('')}
    </select>
  </label>`;
}

function tabs(active) {
  return `<div class="practice-bar">
    <div class="segmented practice-tabs" role="tablist">
      ${TABS.map(
        ([key, label, ic]) => `<button role="tab" data-act="practice-tab" data-value="${key}" aria-pressed="${active === key}" aria-selected="${active === key}">
          ${icon(ic, 'icon-sm icon')} ${esc(t(label))}
        </button>`,
      ).join('')}
    </div>
    ${chapterPicker()}
  </div>`;
}

function nothingHere() {
  return emptyState({
    art: {
      src: 'empty-deck.webp',
      alt: 'Flat line illustration: an empty card tray on a desk, thin black outline, blue and beige fills, white background, no text',
    },
    title: t('No cards yet'),
    body: t('Cards arrive from your Claude Code sessions. Come back after a build.'),
    action: `<button class="btn" data-act="go" data-value="overview">${icon('house', 'icon-sm icon')} ${esc(t('Back to overview'))}</button>`,
  });
}

function deckRun() {
  const state = practice();
  if (!state.cards) {
    state.cards = {
      deck: state.deck,
      order: scopedCards().map((card) => card.id),
      index: 0,
      flipped: false,
      sorting: false,
      verdicts: {},
      history: [],
    };
  }
  state.cards.order = state.cards.order.filter((id) => cardById(id));
  return state.cards;
}

function cardFace(card, run) {
  const info = meta(card.category);
  return `<article class="flip" data-act="flip" ${run.flipped ? 'data-flipped' : ''} style="${tintOf(card.category)}"
      role="button" tabindex="0" aria-label="${esc(run.flipped ? t('Show the word') : t('Show the meaning'))}">
    <div class="flip-inner">
      <div class="flip-face front">
        <div class="flip-head">
          <span class="tag">${icon(info.icon)}${esc(info.label)}</span>
          ${card.cefr ? `<span class="level">${esc(card.cefr)}</span>` : ''}
          <span class="flip-tools">
            ${sayButton(card)}
            <button class="star" data-act="favorite" data-value="${card.id}" aria-pressed="${!!card.isFavorite}"
              aria-label="${esc(card.isFavorite ? t('Remove from favourites') : t('Add to favourites'))}">
              ${icon(card.isFavorite ? 'star-fill' : 'star', 'icon-sm icon')}
            </button>
          </span>
        </div>
        <div class="flip-body">
          <div class="prompt" ${langAttrs(app.config.target)}>${esc(card.front)}</div>
          ${card.reading ? `<p class="reading" lang="und" dir="ltr">${esc(card.reading)}</p>` : ''}
        </div>
      </div>
      <div class="flip-face back">
        <div class="flip-head"><span class="tag">${icon(info.icon)}${esc(info.label)}</span></div>
        <div class="flip-body">
          <div class="prompt" ${langAttrs(app.config.native)}>${esc(card.back)}</div>
          ${card.example ? `<p class="example" ${langAttrs(app.config.target)}>${esc(card.example)}</p>` : ''}
        </div>
      </div>
    </div>
    <span class="swipe-label" data-side="no">${icon('x', 'icon-sm icon')} ${esc(t('Still learning'))}</span>
    <span class="swipe-label" data-side="yes">${icon('check', 'icon-sm icon')} ${esc(t('Know'))}</span>
  </article>`;
}

function sortSummary(run) {
  const { known, learning } = sortCounts(run.verdicts);
  const learningIds = run.order.filter((id) => run.verdicts[id] === false);
  return `<div class="practice-done enter">
    ${ring(run.order.length ? known / run.order.length : 0, { size: 96, label: pct(run.order.length ? known / run.order.length : 0), hole: 'var(--panel)' })}
    <h2>${esc(learning ? t('Sorted. {n} still to learn.', { n: learning }) : t('All of them known'))}</h2>
    <div class="summary-stats">
      <div><span class="n" style="color:var(--mint-ink)">${known}</span><span class="l">${esc(t('know'))}</span></div>
      <div><span class="n" style="color:var(--rose-ink)">${learning}</span><span class="l">${esc(t('still learning'))}</span></div>
    </div>
    <p class="lede">${esc(t('Cards you know stay out of Learn and Test until you sort them back.'))}</p>
    <div class="grades">
      ${
        learningIds.length
          ? `<button class="btn btn-primary" data-act="sort-learning">${icon('arrow-counter-clockwise', 'icon-sm icon')} ${esc(t('Review the {n} still learning', { n: learningIds.length }))}</button>`
          : ''
      }
      <button class="btn" data-act="sort-restart">${icon('shuffle', 'icon-sm icon')} ${esc(t('Start over'))}</button>
      <button class="btn" data-act="practice-tab" data-value="learn">${icon('brain', 'icon-sm icon')} ${esc(t('Go to Learn'))}</button>
    </div>
  </div>`;
}

function renderCards(page) {
  const run = deckRun();
  if (!run.order.length) return (page.innerHTML = tabs('cards') + nothingHere());
  if (run.index >= run.order.length) {
    if (run.sorting) return (page.innerHTML = tabs('cards') + `<div class="stage">${sortSummary(run)}</div>`);
    run.index = run.order.length - 1;
  }
  const card = cardById(run.order[run.index]);
  const total = run.order.length;
  const { known, learning } = sortCounts(run.verdicts);
  page.innerHTML = `${tabs('cards')}
    <div class="stage practice-stage">
      ${cardFace(card, run)}
      <div class="practice-controls">
        <button class="btn ${run.sorting ? 'btn-primary' : ''}" data-act="sort-toggle" aria-pressed="${run.sorting}">
          ${icon('arrows-left-right', 'icon-sm icon')} ${esc(run.sorting ? t('Stop sorting') : t('Sort cards'))}
        </button>
        <span class="practice-nav">
          ${
            run.sorting
              ? `<button class="round" data-verdict="no" data-act="sort-no" aria-label="${esc(t('Still learning'))}">${icon('x')}</button>`
              : `<button class="round" data-act="card-prev" ${run.index === 0 ? 'disabled' : ''} aria-label="${esc(t('Previous card'))}">${icon('arrow-left')}</button>`
          }
          <span class="count">${run.index + 1} / ${total}</span>
          ${
            run.sorting
              ? `<button class="round" data-verdict="yes" data-act="sort-yes" aria-label="${esc(t('Know'))}">${icon('check')}</button>`
              : `<button class="round" data-act="card-next" ${run.index >= total - 1 ? 'disabled' : ''} aria-label="${esc(t('Next card'))}">${icon('arrow-right')}</button>`
          }
        </span>
        <span class="practice-tools">
          ${run.sorting ? `<button class="round" data-act="sort-undo" ${run.history.length ? '' : 'disabled'} aria-label="${esc(t('Undo'))}">${icon('arrow-u-up-left')}</button>` : ''}
          <button class="round" data-act="card-shuffle" aria-label="${esc(t('Shuffle'))}">${icon('shuffle')}</button>
        </span>
      </div>
      ${
        run.sorting
          ? `<div class="sort-tally"><span style="color:var(--rose-ink)">${learning} ${esc(t('still learning'))}</span><span style="color:var(--mint-ink)">${known} ${esc(t('know'))}</span></div>`
          : ''
      }
      <span class="track practice-track"><i style="--p:${((run.index + (run.sorting ? 0 : 1)) / total).toFixed(4)}"></i></span>
    </div>`;
  if (run.sorting) bindSwipe(page.querySelector('.flip'), (rating) => verdict(rating === 3));
}

async function verdict(known) {
  const run = deckRun();
  const id = run.order[run.index];
  const card = cardById(id);
  if (!card || run.busy) return;
  run.busy = true;
  flyCard($('#page-practice .flip'), known ? 3 : 1);
  try {
    await api('/known', { id, on: known });
  } catch (error) {
    run.busy = false;
    return toast(error.message || t('Could not save that'), 'error');
  }
  run.history.push({ id, prev: !!card.isKnown, index: run.index });
  run.verdicts[id] = known;
  card.isKnown = known;
  run.index++;
  run.flipped = false;
  run.busy = false;
  setTimeout(() => renderCards($('#page-practice')), reducedMotion() ? 0 : FLY_MS * 0.6);
}

async function undoVerdict() {
  const run = deckRun();
  const last = run.history.pop();
  if (!last) return;
  const card = cardById(last.id);
  try {
    await api('/known', { id: last.id, on: last.prev });
  } catch (error) {
    run.history.push(last);
    return toast(error.message || t('Could not save that'), 'error');
  }
  if (card) card.isKnown = last.prev;
  delete run.verdicts[last.id];
  run.index = last.index;
  run.flipped = false;
  renderCards($('#page-practice'));
}

function learnRun() {
  const state = practice();
  if (!state.learn) {
    const pool = studyPool();
    state.learn = {
      queue: shuffle(pool).map((card) => card.id),
      total: pool.length,
      index: 0,
      choices: null,
      answered: null,
      right: 0,
      wrong: 0,
      busy: false,
    };
  }
  return state.learn;
}

function learnCard(run) {
  while (run.index < run.queue.length) {
    const card = cardById(run.queue[run.index]);
    if (card) return card;
    run.index++;
  }
  return null;
}

function renderLearn(page) {
  if (!scopedCards().length) return (page.innerHTML = tabs('learn') + nothingHere());
  const run = learnRun();
  const card = learnCard(run);
  if (!card) {
    const asked = run.right + run.wrong;
    const accuracy = asked ? run.right / asked : 0;
    page.innerHTML = `${tabs('learn')}<div class="stage"><div class="practice-done enter">
      ${ring(accuracy, { size: 96, label: pct(accuracy), hole: 'var(--panel)' })}
      <h2>${esc(t('Round done'))}</h2>
      <div class="summary-stats">
        <div><span class="n" style="color:var(--mint-ink)">${run.right}</span><span class="l">${esc(t('right'))}</span></div>
        <div><span class="n" style="color:var(--rose-ink)">${run.wrong}</span><span class="l">${esc(t('wrong'))}</span></div>
        <div><span class="n">${run.total}</span><span class="l">${esc(t('cards'))}</span></div>
      </div>
      <div class="grades">
        <button class="btn btn-primary" data-act="learn-again">${icon('arrow-counter-clockwise', 'icon-sm icon')} ${esc(t('Learn again'))}</button>
        <button class="btn" data-act="practice-tab" data-value="test">${icon('exam', 'icon-sm icon')} ${esc(t('Take a test'))}</button>
      </div>
    </div></div>`;
    return;
  }
  if (!run.choices) {
    run.choices = buildChoices(card, app.cards, shuffle, frontOf);
  }
  const answered = run.answered;
  const skipped = leftOut();
  page.innerHTML = `${tabs('learn')}
    <div class="learn-panel panel">
      <div class="learn-top">
        <span class="count">${run.index + 1} / ${run.queue.length}</span>
        ${skipped ? `<span class="field-hint">${esc(tn(skipped, 'card you know is left out', 'cards you know are left out'))}</span>` : ''}
      </div>
      <div class="learn-prompt" ${langAttrs(app.config.native)}>${esc(card.back)}</div>
      <div class="learn-note" ${answered ? (answered.correct ? 'data-ok' : 'data-miss') : ''}>
        ${esc(answered ? (answered.correct ? t('Right!') : t('No worries, you are still learning!')) : t('Choose the answer'))}
      </div>
      <div class="choices" ${answered ? 'data-answered' : ''} ${langAttrs(app.config.target)}>
        ${run.choices
          .map((choice, index) => {
            let state = '';
            if (answered) {
              if (choice === card.front) state = choice === answered.picked ? 'right' : 'answer';
              else if (choice === answered.picked) state = 'wrong';
              else state = 'muted';
            }
            const mark = state === 'wrong' ? icon('x', 'icon-sm icon') : state === 'right' || state === 'answer' ? icon('check', 'icon-sm icon') : index + 1;
            return `<button class="choice" data-act="learn-choose" data-value="${esc(choice)}" ${state ? `data-state="${state}"` : ''}>
              <span class="key">${mark}</span><span>${esc(choice)}</span>
            </button>`;
          })
          .join('')}
      </div>
      ${
        answered && !answered.correct
          ? `<div class="learn-foot">
              <span>${esc(t('Press any key to continue'))}</span>
              <button class="btn btn-primary" data-act="learn-continue">${esc(t('Continue'))}</button>
            </div>`
          : `<div class="learn-foot"><button class="btn btn-quiet" data-act="learn-dunno">${esc(t('Not sure?'))}</button></div>`
      }
    </div>`;
}

async function learnChoose(picked) {
  const run = learnRun();
  const card = learnCard(run);
  if (!card || run.answered || run.busy) return;
  const correct = picked === card.front;
  run.answered = { picked, correct };
  if (correct) run.right++;
  else {
    run.wrong++;
    run.queue.push(card.id);
  }
  renderLearn($('#page-practice'));
  if (app.config.speech !== 'off') speak(card.front, app.config.target);
  run.busy = true;
  try {
    await api('/grade', { id: card.id, rating: correct ? 3 : 1, mode: 'learn' });
    card.isNew = false;
  } catch {}
  run.busy = false;
  if (correct) setTimeout(() => learnContinue(), CORRECT_MS);
}

function learnContinue() {
  const run = practice().learn;
  if (!run || !run.answered) return;
  run.index++;
  run.answered = null;
  run.choices = null;
  if (app.route === 'practice' && practice().tab === 'learn') renderLearn($('#page-practice'));
}

function testSettings(page) {
  const state = practice();
  const cfg = state.testConfig;
  const pool = studyPool();
  const max = pool.length;
  cfg.count = Math.max(1, Math.min(cfg.count || DEFAULT_COUNT, max));
  const skipped = leftOut();
  page.innerHTML = `${tabs('test')}
    <div class="panel exam-setup">
      <div class="section-head" style="margin:0 0 6px"><h2>${esc(t('Set up your test'))}</h2>${icon('exam', 'icon')}</div>
      <p class="field-hint">${esc(tn(max, 'card to draw from', 'cards to draw from'))}${skipped ? ` · ${esc(tn(skipped, 'you know is left out', 'you know are left out'))}` : ''}</p>
      <label class="exam-row"><span>${esc(t('Questions'))} <small>(${esc(t('max {n}', { n: max }))})</small></span>
        <input class="input" id="exam-count" type="number" min="1" max="${max}" value="${cfg.count}" style="width:88px"></label>
      <label class="exam-row"><span>${esc(t('Answer with'))}</span>
        <select class="select" id="exam-side">
          ${ANSWER_WITH.map((key) => `<option value="${key}" ${cfg.answerWith === key ? 'selected' : ''}>${esc(t(ANSWER_LABEL[key]))}</option>`).join('')}
        </select></label>
      <hr class="exam-hr">
      ${TYPES.map(
        (kind) => `<div class="exam-row"><span>${esc(t(KIND_LABEL[kind]))}</span>
          <button class="switch" role="switch" data-act="test-type" data-value="${kind}" aria-checked="${cfg.types.includes(kind)}" aria-label="${esc(t(KIND_LABEL[kind]))}"></button></div>`,
      ).join('')}
      <div class="exam-start">
        <button class="btn btn-primary" data-act="test-start" ${cfg.types.length ? '' : 'disabled'}>${icon('play', 'icon-sm icon')} ${esc(t('Start test'))}</button>
      </div>
    </div>`;
}

const faceLang = (side) => langAttrs(side === 'term' ? app.config.target : app.config.native);

function questionBody(q, answers, result) {
  const given = answers[q.n];
  const done = !!result;
  const mark = (chosen, correct) => {
    if (!done) return `aria-pressed="${chosen}"`;
    if (correct) return 'data-state="right"';
    return chosen ? 'data-state="wrong"' : 'data-state="muted"';
  };
  if (q.kind === 'tf') {
    return `<div class="exam-shown" ${faceLang(q.answerSide)}>${esc(q.shown)}</div>
      <div class="exam-tf">
        <button class="choice" data-act="test-tf" data-value="${q.n}:true" ${mark(given === true, q.truth === true)}>${esc(t('True'))}</button>
        <button class="choice" data-act="test-tf" data-value="${q.n}:false" ${mark(given === false, q.truth === false)}>${esc(t('False'))}</button>
      </div>`;
  }
  if (q.kind === 'mc') {
    return `<div class="choices" ${faceLang(q.answerSide)}>${q.choices
      .map(
        (choice) =>
          `<button class="choice" data-act="test-mc" data-value="${q.n}:${esc(choice)}" ${mark(given === choice, choice === q.answer)}><span>${esc(choice)}</span></button>`,
      )
      .join('')}</div>`;
  }
  if (q.kind === 'match') {
    return `<div class="exam-match">${q.items
      .map((item) => {
        const chosen = given?.[item.id] || '';
        const right = done && chosen === item.answer;
        return `<div class="match-row" ${done ? `data-state="${right ? 'right' : 'wrong'}"` : ''}>
          <span ${faceLang(item.promptSide)}>${esc(item.prompt)}</span>
          <select class="select" data-match="${q.n}:${item.id}" ${done ? 'disabled' : ''} ${faceLang(item.answerSide)}>
            <option value="">${esc(t('Choose'))}</option>
            ${q.options.map((option) => `<option ${chosen === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}
          </select>
          ${done && !right ? `<span class="exam-answer">${esc(item.answer)}</span>` : ''}
        </div>`;
      })
      .join('')}</div>`;
  }
  return `<input class="input exam-written" data-written="${q.n}" type="text" autocomplete="off" spellcheck="false"
      ${faceLang(q.answerSide)} value="${esc(given || '')}" ${done ? 'readonly' : ''}
      placeholder="${esc(t('Type the answer'))}" aria-label="${esc(t('Your answer'))}">`;
}

function questionCard(q, run, index, total) {
  const row = run.score?.results[index];
  const skipped = q.skipped && !run.score;
  const tone = row ? (row.skipped ? 'skipped' : row.earned === row.points ? 'right' : 'wrong') : '';
  return `<section class="panel exam-q" id="q-${q.n}" ${tone ? `data-result="${tone}"` : ''} ${skipped ? 'data-skipped' : ''}>
    <div class="exam-head"><span class="micro">${esc(t(KIND_LABEL[q.kind]))}</span><span class="micro">${esc(t('{n} of {total}', { n: index + 1, total }))}</span></div>
    ${q.kind === 'match' ? '' : `<div class="exam-prompt" ${faceLang(q.promptSide)}>${esc(q.prompt)}</div>`}
    ${q.kind === 'match' ? '' : `<div class="micro" style="margin-bottom:10px">${esc(q.kind === 'written' ? t('Type the answer') : t('Choose the answer'))}</div>`}
    ${questionBody(q, run.answers, run.score)}
    ${
      row
        ? row.skipped
          ? `<p class="exam-answer">${esc(t('Skipped'))}${q.kind === 'match' ? '' : ` · ${esc(q.answer)}`}</p>`
          : row.earned < row.points && q.kind !== 'match'
            ? `<p class="exam-answer">${icon('check', 'icon-sm icon')} ${esc(q.answer)}</p>`
            : ''
        : `<div class="exam-foot">${
            skipped
              ? `<span class="field-hint">${esc(t('Skipped'))}</span>`
              : `<button class="btn btn-quiet exam-skip" data-act="test-skip" data-value="${q.n}">${esc(t('Not sure?'))}</button>`
          }</div>`
    }
  </section>`;
}

function renderTest(page) {
  if (!scopedCards().length) return (page.innerHTML = tabs('test') + nothingHere());
  const run = practice().test;
  if (!run) return testSettings(page);
  const total = run.questions.length;
  const score = run.score;
  page.innerHTML = `${tabs('test')}
    ${
      score
        ? `<div class="practice-done enter panel exam-result">
            ${ring(score.accuracy, { size: 96, label: pct(score.accuracy), hole: 'var(--panel)' })}
            <h2>${esc(score.accuracy >= 0.9 ? t('Excellent') : score.accuracy >= 0.6 ? t('Good work') : t('Keep at it'))}</h2>
            <p class="lede">${esc(t('{n} of {total} right', { n: score.earned, total: score.total }))}</p>
            <div class="grades">
              <button class="btn btn-primary" data-act="test-new">${icon('arrow-counter-clockwise', 'icon-sm icon')} ${esc(t('New test'))}</button>
              <button class="btn" data-act="practice-tab" data-value="cards">${icon('cards-three', 'icon-sm icon')} ${esc(t('Back to flashcards'))}</button>
            </div>
          </div>`
        : ''
    }
    <div class="exam-list">${run.questions.map((q, index) => questionCard(q, run, index, total)).join('')}</div>
    ${
      score
        ? ''
        : `<div class="exam-submit">
            ${icon('exam', 'icon')}
            <h2>${esc(t('All done! Submit the test?'))}</h2>
            <button class="btn btn-primary lg" data-act="test-submit">${esc(t('Submit test'))}</button>
          </div>
          <dialog class="modal" id="exam-skipped"><div class="panel" style="text-align:center">
            <h2 style="margin:0 0 8px">${esc(t('You skipped some questions!'))}</h2>
            <p class="lede">${esc(t('Review the skipped ones, or submit the test as it is?'))}</p>
            <div class="grades" style="margin-top:18px">
              <button class="btn" data-act="test-review-skipped">${esc(t('Review skipped questions'))}</button>
              <button class="btn btn-primary" data-act="test-force-submit">${esc(t('Submit test'))}</button>
            </div>
          </div></dialog>`
    }`;
}

function setAnswer(n, value) {
  const run = practice().test;
  if (!run || run.score) return;
  run.answers[n] = value;
  const q = run.questions[n];
  if (q) q.skipped = false;
}

function submitTest(force = false) {
  const run = practice().test;
  if (!run || run.score) return;
  const open = run.questions.filter((q) => !isAnswered(q, run.answers[q.n]));
  if (open.length && !force) return $('#exam-skipped')?.showModal();
  $('#exam-skipped')?.close();
  const check = (typed, answer) => checkTyped(typed, answer, [], app.config.target).correct;
  run.score = scoreTest(run.questions, run.answers, check);
  renderTest($('#page-practice'));
  $('#main')?.scrollTo?.({ top: 0 });
}

function renderPractice() {
  const page = $('#page-practice');
  const wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  if (TABS.some(([key]) => key === wanted)) practice().tab = wanted;
  const tab = practice().tab;
  if (tab === 'learn') return renderLearn(page);
  if (tab === 'test') return renderTest(page);
  return renderCards(page);
}

export function practiceKeys(event) {
  if (app.route !== 'practice') return false;
  const state = practice();
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);
  if (typing) return false;

  if (state.tab === 'cards') {
    const run = deckRun();
    if (!run.order.length) return false;
    if (event.key === ' ' || event.key === 'Enter') return ACTIONS.flip(), true;
    if (event.key === 'ArrowLeft') return (run.sorting ? verdict(false) : ACTIONS['card-prev']()), true;
    if (event.key === 'ArrowRight') return (run.sorting ? verdict(true) : ACTIONS['card-next']()), true;
    if (event.key.toLowerCase() === 'u' && run.sorting) return undoVerdict(), true;
    if (event.key === 'Escape' && run.sorting) return ACTIONS['sort-toggle'](), true;
    return false;
  }

  if (state.tab === 'learn') {
    const run = state.learn;
    if (!run || !learnCard(run)) return false;
    if (run.answered) {
      if (!run.answered.correct && event.key !== 'Escape') learnContinue();
      return true;
    }
    const digit = Number(event.key);
    if (digit >= 1 && digit <= (run.choices?.length || 0)) return learnChoose(run.choices[digit - 1]), true;
    return false;
  }

  if (event.key === 'Escape' && $('#exam-skipped')?.open) return $('#exam-skipped').close(), true;
  return false;
}

Object.assign(ACTIONS, {
  'practice-tab': (value) => {
    practice().tab = TABS.some(([key]) => key === value) ? value : 'cards';
    history.replaceState(null, '', `#/practice?tab=${practice().tab}`);
    if (app.route !== 'practice') go('practice');
    else renderPractice();
  },
  flip: () => {
    const run = deckRun();
    const face = $('#page-practice .flip');
    if (face?.dataset.noflip) return delete face.dataset.noflip;
    run.flipped = !run.flipped;
    if (face) {
      face.toggleAttribute('data-flipped', run.flipped);
      face.setAttribute('aria-label', run.flipped ? t('Show the word') : t('Show the meaning'));
    } else renderCards($('#page-practice'));
  },
  'card-prev': () => {
    const run = deckRun();
    if (run.index === 0) return;
    run.index--;
    run.flipped = false;
    renderCards($('#page-practice'));
  },
  'card-next': () => {
    const run = deckRun();
    if (run.index >= run.order.length - 1) return;
    run.index++;
    run.flipped = false;
    renderCards($('#page-practice'));
  },
  'card-shuffle': () => {
    const run = deckRun();
    run.order = shuffle(run.order);
    run.index = 0;
    run.flipped = false;
    run.verdicts = {};
    run.history = [];
    renderCards($('#page-practice'));
  },
  'sort-toggle': () => {
    const run = deckRun();
    run.sorting = !run.sorting;
    run.flipped = false;
    if (run.sorting) {
      run.index = 0;
      run.verdicts = {};
      run.history = [];
    } else run.index = Math.min(run.index, run.order.length - 1);
    renderCards($('#page-practice'));
  },
  'sort-no': () => verdict(false),
  'sort-yes': () => verdict(true),
  'sort-undo': () => undoVerdict(),
  'sort-learning': () => {
    const run = deckRun();
    run.order = run.order.filter((id) => run.verdicts[id] === false);
    run.index = 0;
    run.verdicts = {};
    run.history = [];
    run.flipped = false;
    renderCards($('#page-practice'));
  },
  'sort-restart': () => {
    practice().cards = null;
    const run = deckRun();
    run.sorting = true;
    renderCards($('#page-practice'));
  },
  'learn-choose': (value) => learnChoose(value),
  'learn-continue': () => learnContinue(),
  'learn-dunno': () => {
    const run = learnRun();
    const card = learnCard(run);
    if (card) learnChoose('');
  },
  'learn-again': () => {
    practice().learn = null;
    renderLearn($('#page-practice'));
  },
  'test-type': (kind) => {
    const cfg = practice().testConfig;
    cfg.types = cfg.types.includes(kind) ? cfg.types.filter((key) => key !== kind) : TYPES.filter((key) => key === kind || cfg.types.includes(key));
    testSettings($('#page-practice'));
  },
  'test-start': () => {
    const state = practice();
    const cfg = state.testConfig;
    cfg.count = clampInt($('#exam-count')?.value, { min: 1, max: Math.max(1, studyPool().length) }) ?? cfg.count;
    cfg.answerWith = $('#exam-side')?.value || cfg.answerWith;
    const questions = buildTest(studyPool(), cfg);
    if (!questions.length) return toast(t('Nothing to ask yet'));
    state.test = { questions, answers: {}, score: null };
    renderTest($('#page-practice'));
    $('#main')?.scrollTo?.({ top: 0 });
  },
  'test-tf': (value) => {
    const [n, truth] = value.split(':');
    setAnswer(Number(n), truth === 'true');
    renderTest($('#page-practice'));
  },
  'test-mc': (value) => {
    const at = value.indexOf(':');
    setAnswer(Number(value.slice(0, at)), value.slice(at + 1));
    renderTest($('#page-practice'));
  },
  'test-skip': (value) => {
    const run = practice().test;
    const q = run?.questions[Number(value)];
    if (!q) return;
    q.skipped = true;
    delete run.answers[q.n];
    renderTest($('#page-practice'));
  },
  'test-submit': () => submitTest(false),
  'test-force-submit': () => submitTest(true),
  'test-review-skipped': () => {
    const run = practice().test;
    $('#exam-skipped')?.close();
    const first = run?.questions.find((q) => !isAnswered(q, run.answers[q.n]));
    if (first) $(`#q-${first.n}`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  },
  'test-new': () => {
    practice().test = null;
    renderTest($('#page-practice'));
  },
});

document.addEventListener('input', (event) => {
  const field = event.target;
  if (field.dataset.written !== undefined) setAnswer(Number(field.dataset.written), field.value);
});

document.addEventListener('change', (event) => {
  const field = event.target;
  if (field.dataset.match === undefined) return;
  const [n, id] = field.dataset.match.split(':');
  const run = practice().test;
  if (!run) return;
  setAnswer(Number(n), { ...(run.answers[Number(n)] || {}), [id]: field.value });
});

document.addEventListener('change', (event) => {
  if (event.target.id !== 'practice-chapter') return;
  const state = practice();
  state.chapter = event.target.value;
  state.cards = null;
  state.learn = null;
  state.test = null;
  renderPractice();
});

document.addEventListener('keydown', (event) => {
  const face = $('#page-practice .flip');
  if (face && document.activeElement === face && (event.key === ' ' || event.key === 'Enter')) event.preventDefault();
});

registerScreen('practice', renderPractice);
