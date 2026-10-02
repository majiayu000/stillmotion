// Frame-exact capture support. With ?capture=1 in the URL the page should drive itself from a virtual clock,
// and the exporter calls window.capture.renderAt(t) before taking each screenshot.
// CSS animations/transitions are paused and seeked relative to the moment they first appeared;
// SMIL animations are seeked with setCurrentTime.
// Loaded as a classic script; attaches itself to window.Stillmotion.
(() => {
  const isCapture = new URLSearchParams(location.search).has('capture');
  const born = new WeakMap();

  function seek(svg, t) {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, t);
      a.pause();
      a.currentTime = t - born.get(a);
    }
    if (svg) {
      svg.pauseAnimations();
      svg.setCurrentTime(t / 1000);
    }
  }

  // duration: total length in ms; update(t): advance the page's own state to virtual time t (ms);
  // svg: optional root <svg> with SMIL animations; audio(): resolves to a base64 WAV of the whole timeline
  function installCapture({ duration, update, svg, audio }) {
    document.documentElement.classList.add('capture');
    window.capture = {
      duration,
      renderAt(t) {
        update(t);
        seek(svg, t);
      },
      audioWav: audio,
    };
  }

  window.Stillmotion = Object.assign(window.Stillmotion || {}, { isCapture, installCapture });
})();
