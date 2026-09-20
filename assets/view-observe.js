/**
 * Space Lightplay — play on scroll & background video.
 * Enqueued only when a block on the page uses one of these modes.
 */
(function () {
	'use strict';

	var NS = window.spaceLightplay;
	if (!NS || !('IntersectionObserver' in window)) return;

	function start(inst) {
		if (inst.userPaused) return;
		if (inst.frame) {
			if (inst.api && !inst.playing) inst.api.play();
			return;
		}
		inst.requireConsent(function () {
			if (!inst.inView && inst.mode === 'scroll') return;
			if (inst.mode === 'background') {
				inst.activate({ background: true });
				return;
			}
			// Sound only has a chance after the visitor interacted with the page (browser autoplay policy).
			var trySound = inst.sound && !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
			inst.activate({ muted: !trySound, checkSound: trySound });
		}, false);
	}

	function stop(inst) {
		if (inst.api && inst.playing) {
			inst.autoPausing = true;
			inst.api.pause();
		}
	}

	// WordPress core's own mobile breakpoint: screens narrower than 782px.
	var mobile = window.matchMedia ? window.matchMedia('(max-width: 781px)') : null;
	// Browser "data saver" (Save-Data): no autoplaying video at all.
	var saveData = !!(navigator.connection && navigator.connection.saveData);

	function autoplayAllowed(inst) {
		if (NS.reducedMotion || saveData) return false;
		if (inst.mode === 'background' && inst.wrap.getAttribute('data-mobile') === '0' && mobile && mobile.matches) return false;
		return true;
	}

	function init() {
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				var inst = NS.get(en.target);
				inst.inView = en.isIntersecting && en.intersectionRatio >= 0.5;
				if (inst.inView) start(inst); else stop(inst);
			});
		}, { threshold: [0, 0.5] });

		var list = NS.all().filter(function (inst) { return inst.mode === 'scroll' || inst.mode === 'background'; });

		function apply() {
			list.forEach(function (inst) {
				if (autoplayAllowed(inst)) {
					io.observe(inst.wrap);
				} else {
					// Poster only (reduced motion, data saver, or a background set not to play on mobile).
					io.unobserve(inst.wrap);
					stop(inst);
					inst.userPaused = NS.reducedMotion || inst.userPaused;
				}
			});
		}
		apply();
		// Rotating a tablet or resizing a window can cross the breakpoint.
		if (mobile) {
			if (mobile.addEventListener) mobile.addEventListener('change', apply);
			else if (mobile.addListener) mobile.addListener(apply);
		}
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
