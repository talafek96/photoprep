'use strict';
// Runtime switches the server decides, fetched once at boot.
//
// `review` is opt-in (`photoprep --review`). It turns on the approve / reject / note-to-assistant
// workflow: an assistant that drove the tool can then read back what the person actually changed,
// what they rejected, and why. A person using photoprep on their own has no assistant to report to,
// so the whole workflow stays hidden unless someone asks for it.
const PPRuntime = { review: false, ready: null };

PPRuntime.ready = fetch('/runtime.json')
  .then(r => (r.ok ? r.json() : {}))
  .then(j => {
    PPRuntime.review = !!j.review;
    if (PPRuntime.review) document.body.classList.add('review');
    return j;
  })
  .catch(() => ({}));

window.__runtime = PPRuntime;
