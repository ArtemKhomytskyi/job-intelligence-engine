export const APP_CSS = `
:root {
  color-scheme: light;
  --ink: #17211b;
  --muted: #657168;
  --surface: #ffffff;
  --canvas: #f3f5f1;
  --line: #d7ddd6;
  --accent: #185c43;
  --accent-strong: #0f4633;
  --positive: #1b6c49;
  --concern: #9a431f;
  --missing: #725c16;
  --focus: #246bce;
  --shadow: 0 10px 30px rgba(28, 49, 37, 0.08);
}
* { box-sizing: border-box; }
html { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--canvas); }
body { margin: 0; line-height: 1.5; }
a { color: var(--accent-strong); text-underline-offset: 0.18em; }
a:hover { color: var(--accent); }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.shell { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; }
.site-header { background: #112a20; color: #f8fbf8; border-bottom: 4px solid #d4a72c; }
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 72px; }
.brand { color: inherit; text-decoration: none; font-weight: 800; letter-spacing: -0.02em; }
.brand small { display: block; color: #b9c9bf; font-size: 0.72rem; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }
nav { display: flex; gap: 1rem; }
nav a { color: #edf5f0; }
main { padding: 1.5rem 0 3rem; }
.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
h1, h2, h3 { line-height: 1.15; letter-spacing: -0.025em; }
h1 { margin: 0; font-size: clamp(1.75rem, 4vw, 2.45rem); }
h2 { margin-top: 0; }
.eyebrow { margin: 0 0 0.3rem; color: var(--accent); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; }
.muted { color: var(--muted); }
.notice, .error-box { padding: 0.8rem 1rem; border-radius: 8px; margin: 0 0 1rem; }
.notice { background: #e6f3eb; border: 1px solid #b4d8c2; }
.error-box { background: #fff0eb; border: 1px solid #e8baa7; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 1.1rem; margin-bottom: 1rem; }
.pipeline-grid, .metadata-grid, .detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
.metric { border-left: 3px solid var(--line); padding-left: 0.7rem; min-width: 0; }
.metric span { display: block; color: var(--muted); font-size: 0.78rem; }
.metric strong { display: block; overflow-wrap: anywhere; }
.toolbar { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.75rem; align-items: end; }
label { display: block; color: var(--muted); font-size: 0.78rem; font-weight: 700; }
input, select, button, .button { width: 100%; min-height: 42px; border: 1px solid #aeb9b1; border-radius: 7px; background: #fff; color: var(--ink); padding: 0.55rem 0.65rem; font: inherit; }
button, .button { display: inline-flex; width: auto; align-items: center; justify-content: center; background: var(--accent); border-color: var(--accent); color: #fff; cursor: pointer; font-weight: 700; text-decoration: none; }
button:hover, .button:hover { background: var(--accent-strong); color: #fff; }
button.secondary, .button.secondary { background: #fff; color: var(--accent-strong); }
button.warning { background: #7b351a; border-color: #7b351a; }
button[disabled] { cursor: wait; opacity: 0.65; }
.toolbar .button { width: 100%; }
.results-summary { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin: 1.25rem 0 0.75rem; }
.recommendations { display: grid; gap: 0.85rem; }
.recommendation { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; gap: 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 1rem; }
.rank { font-size: 1.55rem; font-weight: 850; color: var(--accent); }
.recommendation h2 { margin: 0 0 0.15rem; font-size: 1.18rem; }
.company { margin: 0; color: var(--muted); }
.facts, .signal-list, .actions, .status-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center; }
.facts { margin-top: 0.7rem; }
.pill { display: inline-flex; align-items: center; min-height: 27px; border-radius: 999px; background: #edf1ed; padding: 0.18rem 0.55rem; font-size: 0.78rem; }
.pill.status { background: #e2ede7; color: #174e39; font-weight: 800; }
.pill.score { background: #143d2e; color: #fff; }
.pill.positive { color: var(--positive); background: #e8f5ed; }
.pill.concern { color: var(--concern); background: #fff0e9; }
.pill.missing { color: var(--missing); background: #fff8dd; }
.signal-list { margin-top: 0.65rem; }
.actions { justify-content: flex-end; align-content: start; max-width: 260px; }
.actions form, .status-actions form { margin: 0; }
.actions button, .actions .button, .status-actions button { min-height: 35px; padding: 0.35rem 0.65rem; font-size: 0.85rem; }
.empty { text-align: center; padding: 3rem 1rem; }
.breadcrumb { margin-bottom: 1rem; }
.detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.detail-grid dt { color: var(--muted); font-size: 0.78rem; font-weight: 700; }
.detail-grid dd { margin: 0.15rem 0 0.8rem; overflow-wrap: anywhere; }
.description { max-height: 38rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #f7f8f6; border: 1px solid var(--line); border-radius: 8px; padding: 1rem; font: inherit; }
.score-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.score-table th, .score-table td { padding: 0.65rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.score-table th { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
.score-reasons { margin: 0.3rem 0 0; padding-left: 1rem; }
.history { margin: 0; padding-left: 1.2rem; }
.run-form { display: flex; gap: 0.7rem; align-items: center; }
.run-form p { margin: 0; }
footer { color: var(--muted); padding: 0 0 2rem; font-size: 0.82rem; }
@media (max-width: 900px) {
  .toolbar { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pipeline-grid { grid-template-columns: 1fr; }
  .recommendation { grid-template-columns: 42px minmax(0, 1fr); }
  .recommendation .actions { grid-column: 2; justify-content: flex-start; max-width: none; }
}
@media (max-width: 620px) {
  .shell { width: min(100% - 1rem, 1180px); }
  .header-inner, .page-heading { align-items: flex-start; flex-direction: column; padding: 0.75rem 0; }
  .toolbar, .detail-grid, .metadata-grid { grid-template-columns: 1fr; }
  .recommendation { grid-template-columns: 1fr; }
  .recommendation .actions { grid-column: 1; }
  .rank { font-size: 1rem; }
  .score-table { display: block; overflow-x: auto; }
}
`;

export const APP_JS = `
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-running-form]')) return;
  const button = form.querySelector('button[type="submit"]');
  if (!(button instanceof HTMLButtonElement)) return;
  button.disabled = true;
  button.textContent = button.dataset.runningLabel || 'Working…';
});
`;
