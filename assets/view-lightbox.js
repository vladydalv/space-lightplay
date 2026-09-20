/**
 * Space Lightplay — lightbox mode (native <dialog>).
 * Enqueued only when a block on the page uses lightbox mode.
 */
(function () {
	'use strict';

	var NS = window.spaceLightplay;
	if (!NS) return;

	var dialog;
	var closeBtn;
	var current = null;

	function build() {
		dialog = document.createElement('dialog');
		dialog.className = 'slp-lightbox';
		closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'slp-ctrl slp-close';
		closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m13.06 12 6.47-6.47-1.06-1.06L12 10.94 5.53 4.47 4.47 5.53 10.94 12l-6.47 6.47 1.06 1.06L12 13.06l6.47 6.47 1.06-1.06L13.06 12Z"/></svg>';
		closeBtn.addEventListener('click', function () { dialog.close(); });
		dialog.appendChild(closeBtn);

		// Click on the backdrop (outside the player) closes.
		dialog.addEventListener('click', function (e) {
			if (e.target === dialog) dialog.close();
		});
		dialog.addEventListener('close', function () {
			if (current) current.teardown();
			current = null;
		});
		document.body.appendChild(dialog);
	}

	NS.openLightbox = function (inst) {
		if (!dialog) build();
		if (current && current !== inst) current.teardown();
		current = inst;

		// Carry only the block's --slp-* variables into the dialog (it lives outside the block).
		var css = '';
		var s = inst.wrap.querySelector('.slp-stage').style;
		for (var i = 0; i < s.length; i++) {
			if (s[i].indexOf('--slp-') === 0) css += s[i] + ':' + s.getPropertyValue(s[i]) + ';';
		}
		dialog.setAttribute('style', css);
		dialog.setAttribute('aria-label', inst.title);
		closeBtn.setAttribute('aria-label', inst.wrap.getAttribute('data-label-close') || 'Close');

		if (!dialog.open) dialog.showModal();
		inst.mount(dialog, { muted: false }, false);
	};

	NS.closeLightbox = function () {
		if (dialog && dialog.open) dialog.close();
	};
})();
