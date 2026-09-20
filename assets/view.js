/**
 * Space Lightplay — core frontend.
 * Nothing external is requested until the visitor plays a video
 * (or, for scroll/background modes, until the block is in view).
 */
(function () {
	'use strict';

	var NS = (window.spaceLightplay = window.spaceLightplay || {});
	var CONSENT_KEY = 'space-lightplay-consent';
	var instances = [];
	var scripts = {};
	var connected = {};
	var noop = function () {};

	NS.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

	function loadScript(src) {
		if (!scripts[src]) {
			scripts[src] = new Promise(function (resolve, reject) {
				var s = document.createElement('script');
				s.src = src;
				s.async = true;
				s.onload = resolve;
				s.onerror = reject;
				document.head.appendChild(s);
			});
		}
		return scripts[src];
	}

	function preconnect(origins) {
		(origins || []).forEach(function (href) {
			if (connected[href]) return;
			connected[href] = true;
			var l = document.createElement('link');
			l.rel = 'preconnect';
			l.href = href;
			l.crossOrigin = 'anonymous';
			document.head.appendChild(l);
		});
	}

	function readConsent() {
		try { return JSON.parse(window.localStorage.getItem(CONSENT_KEY) || '{}') || {}; } catch (e) { return {}; }
	}
	function storeConsent(source) {
		try {
			var v = readConsent();
			v[source] = 1;
			window.localStorage.setItem(CONSENT_KEY, JSON.stringify(v));
		} catch (e) {}
	}

	/* ── YouTube IFrame API (loaded only after the first play) ── */
	var ytReady;
	function loadYT() {
		if (!ytReady) {
			ytReady = new Promise(function (resolve) {
				if (window.YT && window.YT.Player && window.YT.loaded) { resolve(window.YT); return; }
				var prev = window.onYouTubeIframeAPIReady;
				window.onYouTubeIframeAPIReady = function () {
					if (typeof prev === 'function') prev();
					resolve(window.YT);
				};
				loadScript('https://www.youtube.com/iframe_api').catch(noop);
			});
		}
		return ytReady;
	}

	/* YouTube segment for loadVideoById/cueVideoById. */
	function segment(inst) {
		var o = { videoId: inst.id, startSeconds: inst.start || 0 };
		if (inst.end) o.endSeconds = inst.end;
		return o;
	}

	/* ── Providers ── */
	var providers = {
		youtube: {
			origins: ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://i.ytimg.com'],
			url: function (inst, o) {
				var q = ['autoplay=1', 'playsinline=1', 'rel=0'];
				if (o.api) q.push('enablejsapi=1', 'origin=' + encodeURIComponent(window.location.origin));
				if (o.muted || o.background) q.push('mute=1');
				if (inst.start) q.push('start=' + inst.start);
				if (inst.end) q.push('end=' + inst.end);
				if (o.background) q.push('controls=0', 'disablekb=1', 'loop=1', 'playlist=' + encodeURIComponent(inst.id));
				return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(inst.id) + '?' + q.join('&');
			},
			connect: function (inst, iframe, emit) {
				return loadYT().then(function (YT) {
					return new Promise(function (resolve) {
						var p = new YT.Player(iframe, {
							events: {
								onReady: function () { resolve(p); },
								onStateChange: function (e) {
									if (e.data === YT.PlayerState.PLAYING) emit('play');
									else if (e.data === YT.PlayerState.PAUSED) emit('pause');
									else if (e.data === YT.PlayerState.ENDED) {
										emit('ended');
										// start/end in the embed URL apply to the first play only; re-cue the segment for replays.
										if (inst.start || inst.end) p.cueVideoById(segment(inst));
									}
								}
							}
						});
					});
				}).then(function (p) {
					return {
						play: function () { p.playVideo(); },
						pause: function () { p.pauseVideo(); },
						setMuted: function (m) { if (m) { p.mute(); } else { p.unMute(); } },
						restart: function () { p.loadVideoById(segment(inst)); },
						isPlaying: function () { return Promise.resolve(p.getPlayerState() === 1); },
						destroy: function () { try { p.destroy(); } catch (e) {} }
					};
				});
			}
		},
		vimeo: {
			origins: ['https://player.vimeo.com', 'https://i.vimeocdn.com', 'https://f.vimeocdn.com'],
			url: function (inst, o) {
				var q = [];
				if (inst.hash) q.push('h=' + encodeURIComponent(inst.hash));
				q.push('autoplay=1', 'playsinline=1', 'dnt=1');
				if (o.background) q.push('background=1');
				else if (o.muted) q.push('muted=1');
				return 'https://player.vimeo.com/video/' + encodeURIComponent(inst.id) + '?' + q.join('&') + (inst.start ? '#t=' + inst.start + 's' : '');
			},
			connect: function (inst, iframe, emit) {
				return loadScript('https://player.vimeo.com/api/player.js').then(function () {
					var p = new window.Vimeo.Player(iframe);
					p.on('play', function () { emit('play'); });
					p.on('pause', function () { emit('pause'); });
					p.on('ended', function () { emit('ended'); });
					// Vimeo has no end parameter: stop at the end time via the player API.
					var finished = false;
					p.on('ended', function () { finished = true; });
					if (inst.end) {
						p.on('timeupdate', function (data) {
							if (!finished && data.seconds >= inst.end) { finished = true; p.pause().catch(noop); emit('ended'); }
						});
					}
					// Replay after the end: back to the start time instead of 0 / the end point.
					p.on('play', function () {
						if (finished) { finished = false; p.setCurrentTime(inst.start || 0).catch(noop); }
					});
					return p.ready().then(function () {
						return {
							play: function () { p.play().catch(noop); },
							pause: function () { p.pause().catch(noop); },
							setMuted: function (m) { p.setMuted(m).catch(noop); },
							restart: function () { p.setCurrentTime(inst.start || 0).then(function () { return p.play(); }).catch(noop); },
							isPlaying: function () { return p.getPaused().then(function (x) { return !x; }); },
							destroy: function () { p.destroy().catch(noop); }
						};
					});
				});
			}
		},
		file: {
			origins: [],
			connect: function (inst, video, emit) {
				['play', 'pause', 'ended'].forEach(function (ev) {
					video.addEventListener(ev, function () { emit(ev); });
				});
				var finished = false;
				video.addEventListener('ended', function () { finished = true; });
				if (inst.end) {
					video.addEventListener('timeupdate', function () {
						if (!finished && video.currentTime >= inst.end) { finished = true; video.pause(); emit('ended'); }
					});
				}
				// Replay after the end: back to the start time.
				video.addEventListener('play', function () {
					if (finished) { finished = false; video.currentTime = inst.start || 0; }
				});
				return Promise.resolve({
					play: function () { var r = video.play(); if (r) r.catch(noop); },
					pause: function () { video.pause(); },
					setMuted: function (m) { video.muted = m; },
					restart: function () { video.currentTime = inst.start || 0; var r = video.play(); if (r) r.catch(noop); },
					isPlaying: function () { return Promise.resolve(!video.paused); },
					destroy: function () { video.pause(); video.removeAttribute('src'); video.load(); }
				});
			}
		}
	};

	/* ── Instance ── */
	function Instance(wrap) {
		var d = wrap.dataset;
		this.wrap = wrap;
		this.source = d.source;
		this.id = d.id;
		this.hash = d.hash;
		this.src = d.src;
		this.start = parseInt(d.start, 10) || 0;
		this.end = parseInt(d.end, 10) || 0;
		this.mode = d.mode;
		this.sound = d.sound === '1';
		this.consent = d.consent === '1';
		this.title = d.title;
		this.provider = providers[this.source];
		this.frame = null;
		this.api = null;
		this.playing = false;
		this.muted = false;
		this.userPaused = false;
		this.autoPausing = false;
		this.listeners = {};
		this.pending = null;

		var self = this;
		this.on('play', function () {
			self.playing = true;
			self.userPaused = false;
			self.wrap.classList.remove('is-ended');
			if (self.mode !== 'background') pauseOthers(self);
			self.syncToggle();
		});
		this.on('pause', function () {
			self.playing = false;
			if (self.autoPausing) { self.autoPausing = false; } else { self.userPaused = true; }
			self.syncToggle();
		});
		this.on('ended', function () {
			self.playing = false;
			if (self.mode === 'background') return;
			if (self.wrap.querySelector('.slp-end')) {
				if (self.inLightbox && NS.closeLightbox) NS.closeLightbox();
				self.wrap.classList.add('is-ended');
				var r = self.wrap.querySelector('.slp-replay');
				if (r) r.focus({ preventScroll: true });
			}
		});
	}

	/**
	 * The provider's player API (YouTube IFrame API / Vimeo player.js) is loaded only
	 * when something needs to control the player: scroll/background modes, an end screen,
	 * or another video on the page to pause. A single plain video loads nothing extra.
	 */
	Instance.prototype.needsApi = function () {
		if (this.source === 'file') return true; // native <video>, costs nothing
		if (this.mode === 'scroll' || this.mode === 'background') return true;
		if (this.start || this.end) return true; // replays must keep the start/end segment
		if (this.wrap.querySelector('.slp-end')) return true;
		return document.querySelectorAll('.space-lightplay[data-source]:not(.slp-mode-background)').length > 1;
	};

	Instance.prototype.on = function (ev, fn) {
		(this.listeners[ev] = this.listeners[ev] || []).push(fn);
	};
	Instance.prototype.emit = function (ev) {
		(this.listeners[ev] || []).forEach(function (fn) { fn(); });
	};

	Instance.prototype.needsConsent = function () {
		return this.consent && !this.consentOk && !readConsent()[this.source];
	};

	Instance.prototype.requireConsent = function (cb, focus) {
		var panel = this.wrap.querySelector('.slp-consent');
		if (!this.needsConsent() || !panel) { cb(); return; }
		var self = this;
		this.pending = cb;
		panel.hidden = false;
		this.wrap.classList.add('is-consent');
		var accept = panel.querySelector('.slp-consent__accept');
		accept.onclick = function () {
			var box = panel.querySelector('.slp-consent__remember input');
			if (box && box.checked) {
				storeConsent(self.source);
				instances.forEach(function (o) { if (o !== self && o.source === self.source) o.release(false); });
			}
			self.release(true);
		};
		if (focus) accept.focus();
	};

	Instance.prototype.release = function (focusPlayer) {
		var panel = this.wrap.querySelector('.slp-consent');
		this.consentOk = true;
		if (panel) panel.hidden = true;
		this.wrap.classList.remove('is-consent');
		var cb = this.pending;
		this.pending = null;
		if (cb) cb(focusPlayer);
	};

	/**
	 * Creates the player inside `container`.
	 * o: { muted, background, checkSound }; inline: whether it replaces the poster in the block.
	 */
	Instance.prototype.mount = function (container, o, inline) {
		var self = this;
		o.api = this.needsApi();
		var frame = document.createElement('div');
		var el;
		frame.className = 'slp-frame space-lightplay-iframe'; // 1.x class kept for theme CSS

		if (this.source === 'file') {
			el = document.createElement('video');
			el.src = this.src + (this.start || this.end ? '#t=' + this.start + (this.end ? ',' + this.end : '') : '');
			el.playsInline = true;
			el.autoplay = true;
			el.muted = !!(o.muted || o.background);
			if (o.background) { el.loop = true; el.setAttribute('aria-hidden', 'true'); } else { el.controls = true; }
			el.setAttribute('aria-label', this.title);
		} else {
			el = document.createElement('iframe');
			el.src = this.provider.url(this, o);
			el.title = this.title;
			el.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
			el.allowFullscreen = true;
			if (o.background) { el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); }
		}

		frame.appendChild(el);
		container.insertBefore(frame, container.firstChild ? container.firstChild.nextSibling : null);
		this.frame = frame;
		this.muted = !!(o.muted || o.background);
		this.inLightbox = !inline;

		if (inline) {
			var shown = function () {
				self.wrap.classList.remove('is-loading');
				self.wrap.classList.add('is-playing');
			};
			if (this.source === 'file') {
				// Native player: show it at once. Its own controls handle loading, a blocked
				// autoplay (press play) or an unsupported codec (the browser's own error).
				shown();
			} else {
				this.wrap.classList.add('is-loading');
				el.addEventListener('load', shown, { once: true });
			}
		}
		if (this.source === 'file' && !o.background) {
			// Safari/iOS need play() inside the click; the autoplay attribute alone is not enough.
			var started = el.play();
			if (started && started.catch) started.catch(noop);
		}

		if (!o.api) return;
		this.provider.connect(this, el, function (ev) { self.emit(ev); }).then(function (api) {
			// Closed or replaced before the API was ready: release the late player object.
			if (self.frame !== frame) { if (api.destroy) api.destroy(); return; }
			self.api = api;
			if (o.checkSound) {
				setTimeout(function () {
					api.isPlaying().then(function (playing) {
						if (!playing) { api.setMuted(true); api.play(); self.muted = true; }
						self.syncMuteButton();
					});
				}, 1500);
			} else {
				self.syncMuteButton();
			}
		}).catch(noop);
	};

	Instance.prototype.activate = function (o) {
		if (this.frame) { if (this.api) this.api.play(); return; }
		preconnect(this.provider.origins);
		this.mount(this.wrap.querySelector('.slp-stage'), o, true);
	};

	Instance.prototype.teardown = function () {
		// Release the provider's player object too, not only its iframe (no leak per lightbox open).
		if (this.api && this.api.destroy) this.api.destroy();
		if (this.frame && this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
		this.frame = null;
		this.api = null;
		this.playing = false;
		this.inLightbox = false;
	};

	Instance.prototype.play = function () {
		var self = this;
		if (this.mode === 'lightbox' && NS.openLightbox) {
			this.requireConsent(function () { NS.openLightbox(self); }, true);
			return;
		}
		this.requireConsent(function () { self.activate({ muted: false }); }, true);
	};

	Instance.prototype.replay = function () {
		this.wrap.classList.remove('is-ended');
		if (this.mode === 'lightbox' && NS.openLightbox) { NS.openLightbox(this); return; }
		if (this.api) this.api.restart();
	};

	Instance.prototype.unmute = function () {
		if (!this.api) return;
		this.api.setMuted(false);
		this.muted = false;
		this.syncMuteButton();
	};

	Instance.prototype.syncMuteButton = function () {
		var b = this.wrap.querySelector('.slp-unmute');
		if (b) b.hidden = !this.muted;
	};

	Instance.prototype.syncToggle = function () {
		var t = this.wrap.querySelector('.slp-toggle');
		if (!t) return;
		var paused = !this.playing;
		t.setAttribute('aria-pressed', paused ? 'true' : 'false');
		t.setAttribute('aria-label', paused ? t.getAttribute('data-label-play') : t.getAttribute('data-label-pause'));
	};

	Instance.prototype.toggleBackground = function () {
		var self = this;
		if (this.playing && this.api) { this.api.pause(); return; }
		this.userPaused = false;
		if (this.api) { this.api.play(); return; }
		this.requireConsent(function () { self.activate({ background: true }); }, true);
	};

	function pauseOthers(current) {
		instances.forEach(function (o) {
			if (o !== current && o.playing && o.api && o.mode !== 'background') {
				o.autoPausing = true;
				o.api.pause();
			}
		});
	}

	function get(wrap) {
		if (!wrap._slp) {
			wrap._slp = new Instance(wrap);
			instances.push(wrap._slp);
		}
		return wrap._slp;
	}

	/* ── Events ── */
	document.addEventListener('click', function (e) {
		var t = e.target.closest && e.target.closest('.slp-play, .slp-replay, .slp-unmute, .slp-toggle');
		if (!t) return;
		var wrap = t.closest('.space-lightplay, .slp-bg');
		if (!wrap) return;
		var inst = get(wrap);
		e.preventDefault();
		if (t.classList.contains('slp-play')) inst.play();
		else if (t.classList.contains('slp-replay')) inst.replay();
		else if (t.classList.contains('slp-unmute')) inst.unmute();
		else inst.toggleBackground();
	});

	// Warm up connections on intent, unless a consent gate is still closed.
	function intent(e) {
		var wrap = e.target.closest && e.target.closest('.space-lightplay, .slp-bg');
		if (!wrap || wrap._slpWarm) return;
		var inst = get(wrap);
		if (inst.needsConsent() || inst.mode === 'background') return;
		wrap._slpWarm = true;
		preconnect(inst.provider.origins);
	}
	document.addEventListener('pointerover', intent, { passive: true });
	document.addEventListener('focusin', intent);

	/* Remote YouTube poster: missing maxres frames come back as a 120px placeholder. */
	function checkPoster(img) {
		var next = (img.getAttribute('data-fallback') || '').split(' ').filter(Boolean);
		img.removeAttribute('data-fallback');
		var swap = function () { if (next.length) img.src = next.shift(); };
		img.addEventListener('load', function () { if (img.naturalWidth <= 120) swap(); });
		img.addEventListener('error', swap);
		if (img.complete && img.naturalWidth <= 120) swap();
	}
	function initPosters() {
		Array.prototype.forEach.call(document.querySelectorAll('.space-lightplay img.slp-poster[data-fallback], .slp-bg img.slp-poster[data-fallback]'), checkPoster);
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPosters);
	else initPosters();

	NS.Instance = Instance;
	NS.get = get;
	NS.all = function () {
		return Array.prototype.map.call(document.querySelectorAll('.space-lightplay[data-source], .slp-bg[data-source]'), get);
	};
})();
