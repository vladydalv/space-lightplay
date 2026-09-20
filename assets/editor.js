/**
 * Space Lightplay — editor (no build step, wp.* globals only).
 */
(function (wp) {
	'use strict';

	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;
	var blocks = wp.blocks;
	var be = wp.blockEditor;
	var c = wp.components;
	var useSelect = wp.data.useSelect;
	var useDispatch = wp.data.useDispatch;
	var apiFetch = wp.apiFetch;
	var useViewportMatch = wp.compose.useViewportMatch;

	var ToolsPanel = c.__experimentalToolsPanel;
	var ToolsPanelItem = c.__experimentalToolsPanelItem;
	var UnitControl = c.__experimentalUnitControl;
	var HStack = c.__experimentalHStack;
	var VStack = c.__experimentalVStack;
	var useColorSettings = be.__experimentalUseMultipleOriginColorsAndGradients;

	var TD = 'space-lightplay';
	var VIDEO = 'space-lightplay/video';
	var END = 'space-lightplay/end-screen';
	var BG = 'space-lightplay/background';

	/* ─────────────────────────── Helpers ─────────────────────────── */

	function parseTime(str) {
		var s = String(str || '').trim();
		if (!s) return 0;
		if (/^\d+$/.test(s)) return parseInt(s, 10);
		if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
			return s.split(':').reduce(function (acc, part) { return acc * 60 + parseInt(part, 10); }, 0);
		}
		var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
		if (!m) return 0;
		return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
	}

	function formatTime(total) {
		total = parseInt(total, 10) || 0;
		if (total <= 0) return '';
		var h = Math.floor(total / 3600);
		var m = Math.floor((total % 3600) / 60);
		var s = total % 60;
		var pad = function (n) { return (n < 10 ? '0' : '') + n; };
		return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
	}

	/** Returns { source, id, hash, start, short } or null. */
	function parseVideoUrl(input) {
		var s = String(input || '').trim();
		if (!s) return null;
		if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { source: 'youtube', id: s, hash: '', start: 0, short: false };
		var u;
		try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
		var host = u.hostname.replace(/^(www|m)\./, '');
		var path = u.pathname;
		var fragT = (u.hash.match(/t=([^&]+)/) || [])[1];
		var start = parseTime(u.searchParams.get('t') || u.searchParams.get('start') || fragT || '');

		if (host === 'youtu.be') {
			var yid = path.replace(/^\/+/, '').split('/')[0];
			return /^[A-Za-z0-9_-]{11}$/.test(yid) ? { source: 'youtube', id: yid, hash: '', start: start, short: false } : null;
		}
		if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
			var v = u.searchParams.get('v');
			if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return { source: 'youtube', id: v, hash: '', start: start, short: false };
			var ym = path.match(/\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
			return ym ? { source: 'youtube', id: ym[2], hash: '', start: start, short: ym[1] === 'shorts' } : null;
		}
		if (/(^|\.)vimeo\.com$/.test(host)) {
			var parts = path.split('/').filter(Boolean);
			for (var i = parts.length - 1; i >= 0; i--) {
				if (/^\d{6,12}$/.test(parts[i])) {
					var next = parts[i + 1];
					var hash = u.searchParams.get('h') || (next && /^[a-f0-9]{6,}$/i.test(next) ? next : '');
					return { source: 'vimeo', id: parts[i], hash: hash, start: start, short: false };
				}
			}
		}
		return null;
	}

	/**
	 * YouTube's oEmbed has no duration, so the editor asks the official IFrame API
	 * (player.getDuration) in an off-screen player. Editor only; visitors never load this.
	 */
	var ytApiReady = null;
	var ytDurations = {};
	function loadYouTubeApi() {
		if (!ytApiReady) {
			ytApiReady = new Promise(function (resolve, reject) {
				if (window.YT && window.YT.Player && window.YT.loaded) { resolve(window.YT); return; }
				var prev = window.onYouTubeIframeAPIReady;
				window.onYouTubeIframeAPIReady = function () { if (typeof prev === 'function') prev(); resolve(window.YT); };
				var s = document.createElement('script');
				s.src = 'https://www.youtube.com/iframe_api';
				s.onerror = reject;
				document.head.appendChild(s);
			});
		}
		return ytApiReady;
	}
	function getYouTubeDuration(id) {
		if (!ytDurations[id]) {
			ytDurations[id] = loadYouTubeApi().then(function (YT) {
				return new Promise(function (resolve) {
					var host = document.createElement('div');
					host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;';
					var target = document.createElement('div');
					host.appendChild(target);
					document.body.appendChild(host);
					var player = null;
					var timer = null;
					var done = function (d) {
						clearTimeout(timer);
						if (player) { try { player.destroy(); } catch (err) { /* already gone */ } }
						host.remove();
						resolve(d);
					};
					timer = setTimeout(function () { done(0); }, 15000);
					player = new YT.Player(target, {
						videoId: id,
						events: {
							onReady: function (e) { done(Math.floor(e.target.getDuration() || 0)); },
							onError: function () { done(0); }
						}
					});
				});
			}).catch(function () { return 0; });
		}
		return ytDurations[id];
	}

	function pageUrl(a) {
		if (a.source === 'vimeo') return 'https://vimeo.com/' + a.videoId + (a.vimeoHash ? '/' + a.vimeoHash : '');
		return 'https://www.youtube.com/watch?v=' + a.videoId;
	}

	function defaultsOf(name) {
		var type = blocks.getBlockType(name);
		var out = {};
		Object.keys(type.attributes).forEach(function (k) { out[k] = type.attributes[k].default; });
		return out;
	}

	/** Width/height → "W/H", snapped to the closest standard ratio within 5 % (as Plyr does). */
	var STANDARD_RATIOS = [[1, 1], [4, 3], [3, 4], [5, 4], [4, 5], [3, 2], [2, 3], [16, 10], [10, 16], [16, 9], [9, 16], [21, 9], [9, 21], [32, 9], [9, 32]];
	function ratioFromSize(w, h) {
		w = parseInt(w, 10); h = parseInt(h, 10);
		if (!w || !h) return '';
		var best = null;
		STANDARD_RATIOS.forEach(function (r) {
			var d = Math.abs(r[0] / r[1] - w / h);
			if (!best || d < best[0]) best = [d, r];
		});
		if (best[0] <= 0.05) return best[1][0] + '/' + best[1][1];
		var gcd = function (a, b) { return b ? gcd(b, a % b) : a; };
		var g = gcd(w, h);
		return (w / g) + '/' + (h / g);
	}

	/* Button radius is stored as a CSS string; the core radius control works with corner objects. */
	var CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
	function radiusToValues(str) {
		var parts = String(str || '').trim().split(/\s+/).filter(Boolean);
		if (parts.length <= 1) return parts[0] || undefined;
		var full = [parts[0], parts[1] || parts[0], parts[2] || parts[0], parts[3] || parts[1] || parts[0]];
		var o = {};
		CORNERS.forEach(function (k, i) { o[k] = full[i]; });
		return o;
	}
	function valuesToRadius(v) {
		if (!v) return '';
		if (typeof v === 'string') return v;
		var list = CORNERS.map(function (k) { return v[k] || '0'; });
		return list.every(function (x) { return x === list[0]; }) ? list[0] : list.join(' ');
	}

	/**
	 * Keeps the editor's selection outline on the block's rounded inner edge.
	 * Reads what the browser actually resolved — from block settings, theme.json,
	 * presets, percentages or per-corner values alike — and exposes the inner radii
	 * (outer radius minus the adjacent border widths) as CSS variables.
	 */
	var CORNER_PROPS = [
		['--slp-r-tl', 'borderTopLeftRadius', 'borderLeftWidth', 'borderTopWidth'],
		['--slp-r-tr', 'borderTopRightRadius', 'borderRightWidth', 'borderTopWidth'],
		['--slp-r-br', 'borderBottomRightRadius', 'borderRightWidth', 'borderBottomWidth'],
		['--slp-r-bl', 'borderBottomLeftRadius', 'borderLeftWidth', 'borderBottomWidth']
	];
	function useInnerRadius() {
		return wp.compose.useRefEffect(function (node) {
			var win = node.ownerDocument.defaultView;
			var update = function () {
				var cs = win.getComputedStyle(node);
				var w = node.offsetWidth;
				var h = node.offsetHeight;
				var len = function (v, base) {
					v = String(v || '0');
					return v.indexOf('%') > -1 ? parseFloat(v) / 100 * base : (parseFloat(v) || 0);
				};
				CORNER_PROPS.forEach(function (c) {
					var parts = String(cs[c[1]]).split(' ');
					var rx = len(parts[0], w);
					var ry = len(parts[1] || parts[0], h);
					var value = Math.max(0, rx - (parseFloat(cs[c[2]]) || 0)) + 'px ' + Math.max(0, ry - (parseFloat(cs[c[3]]) || 0)) + 'px';
					if (node.style.getPropertyValue(c[0]) !== value) node.style.setProperty(c[0], value);
				});
			};
			update();
			var ro = new win.ResizeObserver(update);
			ro.observe(node);
			var mo = new win.MutationObserver(update);
			mo.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
			return function () { ro.disconnect(); mo.disconnect(); };
		}, []);
	}

	function pick(defs, keys) {
		var o = {};
		keys.forEach(function (k) { o[k] = defs[k]; });
		return o;
	}

	function useDropdownMenuProps() {
		var isMobile = useViewportMatch('medium', '<');
		return isMobile ? {} : { popoverProps: { placement: 'left-start', offset: 259 } };
	}

	/* Block icons: single evenodd paths, no fill attribute — the editor colours them via currentColor. */
	function blockIcon(d) {
		return el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24' },
			el('path', { fillRule: 'evenodd', clipRule: 'evenodd', d: d })
		);
	}
	var FRAME = 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 1.5a.5.5 0 0 0-.5.5v10c0 .28.22.5.5.5h14a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5H5Z';
	var ICON_VIDEO = blockIcon(FRAME + 'M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm-1 2v3.5L14 12l-3-1.75Z');
	var ICON_BACKGROUND = blockIcon('M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 5v1.5h10V10H7Zm2 3v1.5h6V13H9Z');
	var ICON_END = blockIcon(FRAME + 'M8 9.25h8v1.5H8v-1.5ZM10 13h4a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2Z');

	var playTriangle = el('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' },
		el('polygon', { points: '20,10 20,90 90,50' })
	);
	var replayIcon = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
		el('path', { d: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z' })
	);

	/* Colour defaults mirrored from style.css — only used to show the swatch of an unset colour. */
	var CSS_DEFAULTS = {
		btnBg: '#0000008c', btnBgHover: '#000000b3', iconColor: '#ffffff', iconColorHover: '#ffffff',
		panelBg: '#000000c7', panelText: '#ffffff', lightboxBackdrop: '#000000e0', playerBg: '#000000', overlayColor: '#000000'
	};

	var ZStack = c.__experimentalZStack;
	var DropdownContentWrapper = c.__experimentalDropdownContentWrapper;
	var ColorGradientControl = be.__experimentalColorGradientControl;
	var RESET_ICON = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true },
		el('path', { d: 'M7 11.5h10V13H7z' })
	);

	/**
	 * One colour row of the Styles › Color panel, built from the same public parts and
	 * CSS classes as core's own rows, including core's Default/Hover tabs (which core
	 * keeps private). tabs: [{ key, label, value, fallback, onChange, gradientValue?, onGradientChange? }]
	 */
	function ColorItem(props) {
		var indicators = props.tabs.map(function (t) { return t.gradientValue || t.value || t.fallback; });
		var panel = function (t) {
			return el(ColorGradientControl, Object.assign({}, props.colorSettings, {
				showTitle: false,
				enableAlpha: props.enableAlpha !== false,
				__experimentalIsRenderedInSidebar: true,
				colorValue: t.value || undefined,
				gradientValue: t.gradientValue || undefined,
				onColorChange: t.onChange,
				onGradientChange: t.onGradientChange,
				clearable: true,
				headingLevel: 3
			}));
		};
		return el(ToolsPanelItem, {
			className: 'block-editor-color-gradient-item block-editor-tools-panel-color-gradient-settings__item',
			label: props.label,
			hasValue: props.hasValue,
			onDeselect: props.onReset,
			resetAllFilter: props.resetAllFilter,
			isShownByDefault: props.isShownByDefault,
			panelId: props.panelId
		},
			el(c.Dropdown, {
				popoverProps: { placement: 'left-start', offset: 36, shift: true },
				className: 'block-editor-tools-panel-color-gradient-settings__dropdown',
				renderToggle: function (o) {
					return el(Fragment, null,
						el(c.Button, {
							__next40pxDefaultSize: true,
							onClick: o.onToggle,
							'aria-expanded': o.isOpen,
							className: 'block-editor-panel-color-gradient-settings__dropdown' + (o.isOpen ? ' is-open' : '')
						},
							el(HStack, { justify: 'flex-start' },
								el(ZStack, { isLayered: false, offset: -8 },
									indicators.map(function (ind, i) {
										return el(c.Flex, { key: i, expanded: false }, el(c.ColorIndicator, { colorValue: ind }));
									})
								),
								el(c.FlexItem, { className: 'block-editor-panel-color-gradient-settings__color-name' }, props.label)
							)
						),
						props.hasValue() ? el(c.Button, {
							__next40pxDefaultSize: true,
							size: 'small',
							label: __('Reset', TD),
							icon: RESET_ICON,
							className: 'block-editor-panel-color-gradient-settings__reset',
							onClick: function () { props.onReset(); if (o.isOpen) o.onToggle(); }
						}) : null
					);
				},
				renderContent: function () {
					return el(DropdownContentWrapper, { paddingSize: 'none' },
						el('div', { className: 'block-editor-panel-color-gradient-settings__dropdown-content' },
							props.tabs.length === 1
								? panel(props.tabs[0])
								: el(c.TabPanel, {
									className: 'slp-color-tabs',
									tabs: props.tabs.map(function (t) { return { name: t.key, title: t.label }; })
								}, function (tab) {
									return panel(props.tabs.filter(function (t) { return t.key === tab.name; })[0]);
								})
						)
					);
				}
			})
		);
	}

	/* ─────────────────────── End screen preset ─────────────────────── */

	var pad = function (v) { return { top: v, right: v, bottom: v, left: v }; };

	var END_PRESET = {
		attributes: {
			style: {
				color: { background: '#000000d1', text: '#ffffff' },
				elements: { link: { color: { text: '#ffffff' } } },
				spacing: { padding: pad('1.5rem'), blockGap: '1rem' }
			},
			layout: { type: 'flex', orientation: 'vertical', justifyContent: 'center', verticalAlignment: 'center' }
		},
		innerBlocks: [
			['core/heading', { level: 3, placeholder: __('Thanks for watching', TD) }],
			['core/buttons', {}, [['core/button', { placeholder: __('Call to action', TD) }]]]
		]
	};

	function createChild(name, preset) {
		return blocks.createBlock(name, preset.attributes, blocks.createBlocksFromInnerBlocksTemplate(preset.innerBlocks));
	}

	/* ─────────────────────── Source form ─────────────────────── */

	function SourceForm(props) {
		var state = useState(props.initial || '');
		var value = state[0], setValue = state[1];
		var errState = useState('');
		var error = errState[0], setError = errState[1];

		function submit(e) {
			if (e) e.preventDefault();
			var parsed = parseVideoUrl(value);
			if (!parsed) {
				setError(__('This doesn’t look like a YouTube or Vimeo link.', TD));
				return;
			}
			setError('');
			props.onSubmit(parsed, value.trim());
		}

		return el('form', { className: 'slp-source-form', onSubmit: submit },
			el(VStack, { spacing: 3 },
				el(HStack, { alignment: 'bottom', spacing: 2, wrap: false },
					el('div', { className: 'slp-source-form__field' },
						el(c.TextControl, {
							__next40pxDefaultSize: true,
							__nextHasNoMarginBottom: true,
							label: __('YouTube or Vimeo link', TD),
							hideLabelFromVision: !!props.hideLabel,
							type: 'url',
							value: value,
							placeholder: 'https://youtu.be/…',
							autoComplete: 'off',
							spellCheck: false,
							onChange: function (v) { setValue(v); if (error) setError(''); }
						})
					),
					el(c.Button, { __next40pxDefaultSize: true, variant: 'primary', type: 'submit' }, props.submitLabel || __('Embed', TD))
				),
				error ? el(c.Notice, { status: 'error', isDismissible: false }, error) : null,
				el(be.MediaUploadCheck, {},
					// HStack keeps the button at its natural width, like core placeholders.
					el(HStack, { justify: 'flex-start' },
						el(be.MediaUpload, {
							allowedTypes: ['video'],
							onSelect: props.onFile,
							render: function (o) {
								return el(c.Button, { __next40pxDefaultSize: true, variant: 'secondary', onClick: o.open }, __('Choose from Media Library', TD));
							}
						})
					)
				)
			)
		);
	}

	/* ─────────────────────── Video block ─────────────────────── */

	function VideoEdit(props) {
		var a = props.attributes;
		var setAttributes = props.setAttributes;
		var clientId = props.clientId;
		var isBgBlock = props.name === BG;
		var mode = isBgBlock ? 'background' : a.mode;
		var defs = defaultsOf(props.name);
		useTransformNotice(props);
		var remote = a.source !== 'file';
		var hasVideo = remote ? !!a.videoId : !!(a.fileId || a.fileUrl);

		var liveState = useState(false);
		var live = liveState[0], setLive = liveState[1];
		var busyState = useState(false);
		var busy = busyState[0], setBusy = busyState[1];
		var failed = useRef({});
		var errState = useState('');
		var posterError = errState[0], setPosterError = errState[1];
		var posterMedia = useSelect(function (select) {
			return a.previewId ? select('core').getMedia(a.previewId, { context: 'view' }) : null;
		}, [a.previewId]);

		var colorSettings = useColorSettings();
		var dropdownMenuProps = useDropdownMenuProps();

		var children = useSelect(function (select) {
			var list = select(be.store).getBlocks(clientId);
			return {
				end: list.filter(function (b) { return b.name === END; })[0],
				count: list.length
			};
		}, [clientId]);
		var dispatch = useDispatch(be.store);

		/* Poster from the video thumbnail, copied into the Media Library by the server. */
		function fetchPoster() {
			var key = a.source + ':' + a.videoId;
			setBusy(true);
			setPosterError('');
			apiFetch({
				path: '/space-lightplay/v1/poster',
				method: 'POST',
				data: { source: a.source, id: a.videoId, hash: a.vimeoHash || '' }
			}).then(function (r) {
				var next = { previewId: r.id, preview: r.url, previewAuto: true };
				if (r.ratio && (!a.videoRatio || /^\d{3,}\//.test(a.videoRatio))) next.videoRatio = r.ratio;
				if (r.title && !a.videoTitle) next.videoTitle = r.title;
				if (r.duration && !a.duration) next.duration = r.duration;
				setAttributes(next);
			}).catch(function (err) {
				failed.current[key] = true;
				setPosterError((err && err.message) ? err.message : __('Could not fetch a thumbnail for this video.', TD));
			}).finally(function () { setBusy(false); });
		}

		useEffect(function () {
			// No poster at all (new block, 1.x block, or custom poster removed): use the video's own, stored locally.
			if (remote && a.videoId && !a.previewId && !a.preview && !busy && !failed.current[a.source + ':' + a.videoId]) {
				fetchPoster();
			}
		}, [a.source, a.videoId, a.previewId, a.preview]);

		/* Video length: bounds for the start/end fields. */
		var fileMedia = useSelect(function (select) {
			return a.source === 'file' && a.fileId ? select('core').getMedia(a.fileId, { context: 'view' }) : null;
		}, [a.source, a.fileId]);
		useEffect(function () {
			if (a.duration) return;
			var alive = true;
			var save = function (d) { if (alive && d > 0) setAttributes({ duration: d }); };
			if (a.source === 'youtube' && a.videoId) {
				getYouTubeDuration(a.videoId).then(save);
			} else if (a.source === 'vimeo' && a.videoId && a.previewId) {
				// Poster already stored: ask the same endpoint only for oEmbed metadata.
				apiFetch({ path: '/space-lightplay/v1/poster', method: 'POST', data: { source: 'vimeo', id: a.videoId, hash: a.vimeoHash || '' } })
					.then(function (r) { save(r.duration || 0); }).catch(function () {});
			} else if (a.source === 'file' && fileMedia && fileMedia.media_details) {
				save(Math.floor(fileMedia.media_details.length || 0));
			}
			return function () { alive = false; };
		}, [a.source, a.videoId, a.duration, a.previewId, fileMedia]);

		function onRemote(parsed, url) {
			var userPoster = a.previewId && !a.previewAuto;
			var next = {
				source: parsed.source,
				videoUrl: url,
				videoId: parsed.id,
				vimeoHash: parsed.hash || '',
				fileId: 0,
				fileUrl: '',
				startAt: parsed.start || 0,
				endAt: parsed.id === a.videoId ? a.endAt : 0,
				duration: parsed.id === a.videoId ? a.duration : 0,
				videoRatio: parsed.short ? '9/16' : '',
				videoTitle: parsed.id === a.videoId ? a.videoTitle : ''
			};
			if (!userPoster) {
				next.previewId = 0;
				next.preview = '';
				next.previewAuto = true;
			}
			setLive(false);
			setAttributes(next);
		}

		function onFile(media) {
			if (!media || !media.url) return;
			var next = {
				source: 'file',
				fileId: media.id || 0,
				fileUrl: media.url,
				videoId: '',
				vimeoHash: '',
				videoUrl: '',
				videoRatio: ratioFromSize(media.width, media.height),
				duration: Math.floor((media.meta && media.meta.length) || parseTime(media.fileLength) || 0),
				startAt: 0,
				endAt: 0,
				videoTitle: a.videoTitle || media.title || '',
				consent: false
			};
			if (a.previewAuto) {
				next.previewId = 0;
				next.preview = '';
				next.previewAuto = false;
			}
			setLive(false);
			setAttributes(next);
		}

		function onPoster(media) {
			if (!media || !media.id) return;
			setAttributes({ previewId: media.id, preview: media.url, previewAuto: false });
		}

		/* ── Style variables (same as render.php) ── */
		var ratio = (a.videoRatio || '16/9').replace('/', ' / ');
		var vars = {
			'--slp-ratio': ratio,
			'--slp-video-ratio': ratio,
			'--slp-btn-size': a.btnSize,
			'--slp-btn-radius': a.btnRadius,
			'--slp-icon-corner': a.iconCornerRadius,
			'--slp-btn-blur': (a.btnBlur || 0) + 'px',
			'--slp-overlay-opacity': (a.overlayOpacity || 0) / 100
		};
		// Colours: only what the user set; defaults come from style.css.
		[['btnBg', '--slp-btn-bg'], ['btnBgHover', '--slp-btn-bg-hover'], ['iconColor', '--slp-icon'], ['iconColorHover', '--slp-icon-hover'],
			['panelBg', '--slp-panel-bg'], ['panelText', '--slp-panel-text'], ['playerBg', '--slp-player-bg'], ['lightboxBackdrop', '--slp-lightbox-backdrop']
		].forEach(function (pair) { if (a[pair[0]]) vars[pair[1]] = a[pair[0]]; });
		if (a.overlayGradient || a.overlayColor) vars['--slp-overlay'] = a.overlayGradient || a.overlayColor;

		// Hooks run on every render (placeholder included) to keep hook order stable.
		var radiusRef = useInnerRadius();
		var ratioAuto = !!(a.style && a.style.dimensions && a.style.dimensions.aspectRatio === 'auto') ? ' slp-ratio-auto' : '';
		var blockProps = be.useBlockProps(isBgBlock
			? { ref: radiusRef, className: 'slp-bg slp-mode-background is-editor' + ratioAuto + (hasVideo ? '' : ' slp-bg--empty'), style: vars }
			: (hasVideo ? {
				ref: radiusRef,
				className: 'space-lightplay is-editor slp-mode-' + mode + ratioAuto + (a.pulse ? ' has-pulse' : '') + (live ? ' is-playing' : ''),
				style: vars
			} : { ref: radiusRef, className: 'slp-empty' }));
		// Background: the block itself holds the content (like core/cover). Video: only the end-screen layer.
		var innerProps = be.useInnerBlocksProps(isBgBlock ? blockProps : { className: 'slp-children' }, isBgBlock ? {
			templateLock: false,
			template: [['core/paragraph', { placeholder: __('Add text on top of the video…', TD) }]]
		} : {
			allowedBlocks: [END],
			renderAppender: false,
			templateLock: false
		});

		/* ── Placeholder ── */
		if (!hasVideo) {
			return el(isBgBlock ? 'div' : 'figure', blockProps,
				el(c.Placeholder, {
					icon: isBgBlock ? ICON_BACKGROUND : ICON_VIDEO,
					label: isBgBlock ? __('Space Lightplay Background', TD) : __('Space Lightplay', TD),
					instructions: isBgBlock
						? __('Paste a YouTube or Vimeo link, or pick a video from the Media Library. It plays muted in a loop behind your content, only while in view.', TD)
						: __('Paste a YouTube or Vimeo link, or pick a video from the Media Library. Nothing loads for visitors until they press play.', TD)
				},
					el(SourceForm, { onSubmit: onRemote, onFile: onFile, hideLabel: true })
				)
			);
		}

		/* ── Poster / live preview ── */
		var media;
		if (a.preview) {
			media = el('img', { className: 'slp-poster', src: a.preview, alt: '' });
		} else if (a.source === 'youtube') {
			var ytThumbs = ['vi_webp/%s/maxresdefault.webp', 'vi/%s/maxresdefault.jpg', 'vi_webp/%s/sddefault.webp', 'vi/%s/sddefault.jpg', 'vi/%s/hqdefault.jpg'].map(function (p) {
				return 'https://i.ytimg.com/' + p.replace('%s', a.videoId);
			});
			var nextThumb = function (e) {
				var i = ytThumbs.indexOf(e.target.getAttribute('src'));
				if (i > -1 && i < ytThumbs.length - 1) e.target.src = ytThumbs[i + 1];
			};
			media = el('img', {
				className: 'slp-poster',
				src: ytThumbs[0],
				alt: '',
				onLoad: function (e) { if (e.target.naturalWidth <= 120) nextThumb(e); },
				onError: nextThumb
			});
		} else if (a.source === 'file') {
			media = el('video', { className: 'slp-poster', src: (a.fileUrl || '') + '#t=0.1', preload: 'metadata', muted: true });
		} else {
			media = el('div', { className: 'slp-poster slp-poster--empty' });
		}

		var frame = null;
		if (live) {
			var src;
			if (a.source === 'youtube') src = 'https://www.youtube-nocookie.com/embed/' + a.videoId + '?rel=0&playsinline=1' + (a.startAt ? '&start=' + a.startAt : '') + (a.endAt > a.startAt ? '&end=' + a.endAt : '');
			else if (a.source === 'vimeo') src = 'https://player.vimeo.com/video/' + a.videoId + '?dnt=1' + (a.vimeoHash ? '&h=' + a.vimeoHash : '') + (a.startAt ? '#t=' + a.startAt + 's' : '');
			frame = el('div', { className: 'slp-frame' },
				a.source === 'file'
					? el('video', { src: a.fileUrl, controls: true, playsInline: true })
					: el('iframe', { src: src, title: a.videoTitle || __('Video player', TD), allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowFullScreen: true })
			);
		}

		function renderSourceForm(o) {
			return el('div', { className: 'slp-replace-popover__inner' },
				el(SourceForm, {
					initial: remote ? (a.videoUrl || pageUrl(a)) : '',
					submitLabel: __('Apply', TD),
					onSubmit: function (p, url) { onRemote(p, url); o.onClose(); },
					onFile: function (m) { onFile(m); o.onClose(); }
				})
			);
		}

		/* ── Toolbar ── */
		var toolbar = el(Fragment, null,
			el(be.BlockControls, { group: 'other' },
				el(c.Dropdown, {
					popoverProps: { placement: 'bottom-start' },
					contentClassName: 'slp-replace-popover',
					renderToggle: function (o) {
						return el(c.ToolbarButton, { onClick: o.onToggle, 'aria-expanded': o.isOpen }, __('Replace video', TD));
					},
					renderContent: renderSourceForm
				}),
				el(be.MediaReplaceFlow, {
					mediaId: a.previewId || undefined,
					mediaURL: a.preview || undefined,
					allowedTypes: ['image'],
					accept: 'image/*',
					name: a.previewId ? __('Replace poster', TD) : __('Add poster', TD),
					onSelect: onPoster,
					onReset: (a.previewId || a.preview) && !a.previewAuto ? function () { setAttributes({ previewId: 0, preview: '', previewAuto: false }); } : undefined
				},
					remote ? el(c.MenuItem, { icon: 'update', onClick: fetchPoster, disabled: busy }, __('Use video thumbnail', TD)) : null
				)
			),
			el(be.BlockControls, { group: 'other' },
				el(c.ToolbarButton, {
					icon: live ? 'hidden' : 'visibility',
					label: live ? __('Show poster', TD) : __('Preview video', TD),
					isPressed: live,
					onClick: function () { setLive(!live); }
				})
			)
		);

		/* ── Inspector ── */
		function item(keys, label, control, shown, className) {
			keys = [].concat(keys);
			return el(ToolsPanelItem, {
				key: keys[0],
				className: className,
				label: label,
				isShownByDefault: shown !== false,
				hasValue: function () { return keys.some(function (k) { return a[k] !== defs[k]; }); },
				onDeselect: function () { setAttributes(pick(defs, keys)); }
			}, control);
		}
		function panel(label, keys, children) {
			return el(ToolsPanel, {
				label: label,
				className: 'slp-tools-panel',
				resetAll: function () { setAttributes(pick(defs, keys)); },
				dropdownMenuProps: dropdownMenuProps
			}, children);
		}
		/* Non-setting content (status, actions) inside a ToolsPanel: full row, always shown. */
		function row(key, node) {
			return el('div', { key: key, className: 'slp-panel-row' }, node);
		}
		var set = function (k) { return function (v) { var o = {}; o[k] = v; setAttributes(o); }; };
		var common = { __nextHasNoMarginBottom: true, __next40pxDefaultSize: true };

		// Blocks saved by early 2.0 builds in "background" mode: offer the Background block.
		var legacyBgNotice = !isBgBlock && a.mode === 'background' ? row('legacy-bg', el(c.Notice, {
			status: 'warning',
			isDismissible: false,
			actions: [{
				label: __('Convert to Background block', TD),
				onClick: function () {
					var block = wp.data.select(be.store).getBlock(clientId);
					var next = blocks.switchToBlockType(block, BG);
					if (next) dispatch.replaceBlocks(clientId, next);
				}
			}]
		}, __('Background video is now a separate block.', TD))) : null;

		var isBg = mode === 'background';
		var endRow = row('end', el(VStack, { spacing: 2, className: 'slp-end-row' },
				el(c.BaseControl.VisualLabel, null, __('End screen', TD)),
				el('p', { className: 'components-base-control__help slp-help' }, __('Shown when the video ends.', TD)),
				isBg ? el(c.Notice, { status: 'info', isDismissible: false }, children.end
					? __('Not shown in Background mode: the video loops and never ends. Remove it or switch to another mode.', TD)
					: __('Not available in Background mode: the video loops and never ends.', TD)) : null,
				children.end
					? el(HStack, { justify: 'flex-start', spacing: 2 },
						el(c.Button, { variant: 'secondary', size: 'compact', onClick: function () { dispatch.selectBlock(children.end.clientId); } }, __('Edit', TD)),
						el(c.Button, { variant: 'tertiary', size: 'compact', isDestructive: true, onClick: function () { dispatch.removeBlock(children.end.clientId, false); } }, __('Remove', TD))
					)
					: el(HStack, { justify: 'flex-start' },
						el(c.Button, {
							variant: 'secondary',
							size: 'compact',
							disabled: isBg,
							accessibleWhenDisabled: true,
							onClick: function () { dispatch.insertBlock(createChild(END, END_PRESET), children.count, clientId, true); }
						}, __('Add end screen', TD))
					)
			)
		);

		var bgPlaybackPanel = isBgBlock ? panel(__('Playback', TD), ['playOnMobile'], [
			item('playOnMobile', __('Play on mobile', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Play on mobile', TD),
				help: a.playOnMobile
					? __('Off: phones get the poster only and load no video.', TD)
					: __('Screens narrower than 782 px show the poster only.', TD),
				checked: a.playOnMobile,
				onChange: set('playOnMobile')
			}))
		]) : null;
		function modeToggle(value, label, control) {
			return el(ToolsPanelItem, {
				key: 'mode-' + value,
				label: label,
				isShownByDefault: true,
				hasValue: function () { return a.mode === value; },
				onDeselect: function () { if (a.mode === value) setAttributes({ mode: 'click' }); }
			}, control);
		}
		var playbackPanel = isBgBlock ? bgPlaybackPanel : panel(__('Playback', TD), ['mode', 'scrollSound', 'lightboxWidth'], [
			legacyBgNotice,
			// Where it plays (inline / lightbox) and when it starts (click / in view) are separate
			// options, stored in the single `mode` attribute for compatibility.
			modeToggle('lightbox', __('Open in lightbox', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Open in lightbox', TD),
				help: __('Plays in a full-screen dialog.', TD),
				checked: mode === 'lightbox',
				onChange: function (v) { setAttributes({ mode: v ? 'lightbox' : 'click' }); }
			})),
			modeToggle('scroll', __('Autoplay when in view', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Autoplay when in view', TD),
				help: mode === 'lightbox' ? __('Not available with the lightbox.', TD) : __('Starts muted and pauses when out of view.', TD),
				checked: mode === 'scroll',
				disabled: mode === 'lightbox',
				onChange: function (v) { setAttributes({ mode: v ? 'scroll' : 'click' }); }
			})),
			mode === 'scroll' ? item('scrollSound', __('Try with sound', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Try with sound', TD),
				help: __('Only works after the visitor has interacted with the page.', TD),
				checked: a.scrollSound,
				onChange: set('scrollSound')
			})) : null,
			mode === 'lightbox' ? item('lightboxWidth', __('Maximum width', TD), el(UnitControl, Object.assign({
				label: __('Maximum width', TD),
				value: a.lightboxWidth,
				units: [
					{ value: 'px', label: 'px', default: 1200 },
					{ value: 'vw', label: 'vw', default: 90 },
					{ value: 'rem', label: 'rem', default: 75 }
				],
				onChange: function (v) { setAttributes({ lightboxWidth: v || defs.lightboxWidth }); }
			}, common))) : null,
			endRow
		]);

		var privacyPanel = remote ? panel(__('Privacy', TD), ['consent', 'consentRemember', 'consentText'], [
			item('consent', __('Ask before loading', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: sprintf(/* translators: %s: video provider, e.g. YouTube. */ __('Ask before loading %s', TD), a.source === 'vimeo' ? 'Vimeo' : 'YouTube'),
				help: __('Nothing loads until the visitor agrees.', TD),
				checked: a.consent,
				onChange: set('consent')
			})),
			a.consent ? item('consentRemember', __('Remember choice', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Offer “Always allow”', TD),
				checked: a.consentRemember,
				onChange: set('consentRemember')
			})) : null,
			a.consent ? item('consentText', __('Notice text', TD), el(c.TextareaControl, {
				__nextHasNoMarginBottom: true,
				label: __('Notice text', TD),
				help: __('Empty uses the default text.', TD),
				autoComplete: 'off',
				value: a.consentText,
				onChange: set('consentText')
			}), false) : null
		]) : null;

		var buttonPanel = !isBgBlock && mode !== 'background' ? panel(__('Play button', TD), ['btnSize', 'btnRadius', 'iconCornerRadius', 'btnBlur', 'pulse'], [
			item('btnSize', __('Size', TD), el(be.HeightControl || be.__experimentalHeightControl, {
				label: __('Size', TD),
				value: a.btnSize,
				onChange: function (v) { setAttributes({ btnSize: v || defs.btnSize }); }
			})),
			item('btnRadius', __('Radius', TD), el(be.__experimentalBorderRadiusControl, {
				values: radiusToValues(a.btnRadius),
				onChange: function (v) { setAttributes({ btnRadius: valuesToRadius(v) || defs.btnRadius }); }
			})),
			item('iconCornerRadius', __('Icon roundness', TD), el(c.RangeControl, Object.assign({
				label: __('Icon roundness', TD),
				value: a.iconCornerRadius,
				min: 0, max: 20,
				onChange: function (v) { setAttributes({ iconCornerRadius: v == null ? defs.iconCornerRadius : v }); }
			}, common))),
			item('btnBlur', __('Background blur', TD), el(c.RangeControl, Object.assign({
				label: __('Background blur', TD),
				value: a.btnBlur,
				min: 0, max: 40,
				onChange: function (v) { setAttributes({ btnBlur: v == null ? defs.btnBlur : v }); }
			}, common))),
			item('pulse', __('Pulse on hover', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Pulse on hover', TD),
				checked: a.pulse,
				onChange: set('pulse')
			}))
		]) : null;

		/* Styles › Color: paired colours share one row with tabs, as core does for links. */
		function colorTab(key, label) {
			return {
				key: key,
				label: label,
				value: a[key],
				fallback: CSS_DEFAULTS[key],
				onChange: function (v) { var o = {}; o[key] = v || ''; setAttributes(o); }
			};
		}
		function colorRow(id, label, tabs, shown, extra) {
			var keys = tabs.map(function (t) { return t.key; }).concat((extra && extra.keys) || []);
			var clear = function () { var o = {}; keys.forEach(function (k) { o[k] = ''; }); return o; };
			return el(ColorItem, Object.assign({
				key: id,
				label: label,
				tabs: tabs,
				colorSettings: colorSettings,
				panelId: clientId,
				isShownByDefault: shown,
				hasValue: function () { return keys.some(function (k) { return !!a[k]; }); },
				onReset: function () { setAttributes(clear()); },
				resetAllFilter: clear
			}, extra || {}));
		}
		var hasButton = mode !== 'background';
		var hasHover = mode !== 'background'; // poster + play button exist in every mode except background
		var overlayLabel = isBgBlock ? __('Overlay', TD) : __('Hover overlay', TD);
		var overlayOpacityLabel = isBgBlock ? __('Overlay opacity', TD) : __('Hover overlay opacity', TD);
		var hasOverlay = isBgBlock || hasHover;
		// Background has no controls; its colours are only needed for the consent notice.
		var hasControls = a.consent || mode === 'scroll' || mode === 'lightbox';
		var colorPanel = el(be.InspectorControls, { group: 'color' },
			hasButton ? colorRow('button', __('Button', TD), [colorTab('btnBg', __('Default', TD)), colorTab('btnBgHover', __('Hover', TD))], true) : null,
			hasButton ? colorRow('icon', __('Icon', TD), [colorTab('iconColor', __('Default', TD)), colorTab('iconColorHover', __('Hover', TD))], true) : null,
			hasOverlay ? colorRow('overlay', overlayLabel, [{
				key: 'overlayColor',
				label: overlayLabel,
				value: a.overlayColor,
				gradientValue: a.overlayGradient,
				fallback: CSS_DEFAULTS.overlayColor,
				onChange: function (v) { setAttributes({ overlayColor: v || '', overlayGradient: '' }); },
				onGradientChange: function (v) { setAttributes({ overlayGradient: v || '', overlayColor: '' }); }
			}], true, { keys: ['overlayGradient'], enableAlpha: false }) : null,
			hasControls || !isBgBlock ? colorRow('controls', __('Controls', TD), [colorTab('panelBg', __('Background', TD)), colorTab('panelText', __('Text', TD))], hasControls) : null,
			mode === 'lightbox' ? colorRow('backdrop', __('Lightbox backdrop', TD), [colorTab('lightboxBackdrop', __('Lightbox backdrop', TD))], true) : null,
			colorRow('player', __('Player background', TD), [colorTab('playerBg', __('Player background', TD))], false),
			hasOverlay ? el(ToolsPanelItem, {
				key: 'overlay-opacity',
				label: overlayOpacityLabel,
				hasValue: function () { return a.overlayOpacity !== defs.overlayOpacity; },
				onDeselect: function () { setAttributes({ overlayOpacity: defs.overlayOpacity }); },
				resetAllFilter: function () { return { overlayOpacity: defs.overlayOpacity }; },
				isShownByDefault: true,
				panelId: clientId
			}, el(c.RangeControl, Object.assign({
				label: overlayOpacityLabel,
				value: a.overlayOpacity,
				min: 0,
				max: 100,
				step: 10,
				required: true,
				onChange: function (v) { setAttributes({ overlayOpacity: v == null ? defs.overlayOpacity : v }); }
			}, common))) : null
		);

		/* Poster status: shows exactly what visitors get, and why. */
		var providerName = a.source === 'vimeo' ? 'Vimeo' : 'YouTube';
		var posterBody;
		if (busy) {
			posterBody = el(HStack, { justify: 'flex-start', spacing: 2 }, el(c.Spinner), el('span', null, __('Saving the video’s thumbnail to the Media Library…', TD)));
		} else if (a.previewId) {
			var w = posterMedia && posterMedia.media_details ? posterMedia.media_details.width : 0;
			var h = posterMedia && posterMedia.media_details ? posterMedia.media_details.height : 0;
			posterBody = el(VStack, { spacing: 2 },
				el('p', { className: 'slp-help' },
					(a.previewAuto ? __('Video thumbnail, stored in your Media Library.', TD) : __('Custom image from your Media Library.', TD)) +
					(w ? ' ' + sprintf(/* translators: 1: image width, 2: image height, in pixels. */ __('%1$d × %2$d px.', TD), w, h) : '')
				),
				a.previewAuto && w && w < 1280 ? el(c.Notice, { status: 'info', isDismissible: false },
					sprintf(/* translators: %s: video provider, e.g. YouTube. */ __('%s has no HD frame for this video, so this is the best one available. Upload your own image for a sharper poster.', TD), providerName)) : null
			);
		} else if (remote) {
			posterBody = el(VStack, { spacing: 2 },
				el(c.Notice, { status: 'warning', isDismissible: false },
					posterError
						? sprintf(/* translators: %s: error message from the server. */ __('Could not save a local copy: %s', TD), posterError)
						: __('No local copy yet.', TD),
					' ',
					a.consent
						? __('Until then visitors see a plain background.', TD)
						: sprintf(/* translators: %s: video provider, e.g. YouTube. */ __('Until then the image loads directly from %s.', TD), providerName)
				),
				el(HStack, { justify: 'flex-start' },
					el(c.Button, {
						variant: 'secondary',
						size: 'compact',
						onClick: function () { failed.current[a.source + ':' + a.videoId] = false; fetchPoster(); }
					}, __('Try again', TD))
				)
			);
		} else {
			posterBody = el('p', { className: 'slp-help' }, __('No poster: the first frame of the video is shown.', TD));
		}
		var customPoster = !!(a.previewId || a.preview) && !a.previewAuto;
		var resetPoster = function () { setAttributes({ previewId: 0, preview: '', previewAuto: false }); };
		var posterActions = el(HStack, { justify: 'flex-start', spacing: 2, wrap: true },
			el(be.MediaUploadCheck, {},
				el(be.MediaUpload, {
					allowedTypes: ['image'],
					value: a.previewId || undefined,
					onSelect: onPoster,
					render: function (o) {
						return el(c.Button, { variant: 'secondary', size: 'compact', onClick: o.open, disabled: busy },
							customPoster ? __('Replace image', TD) : __('Use own image', TD));
					}
				})
			),
			remote && customPoster ? el(c.Button, { variant: 'tertiary', size: 'compact', onClick: fetchPoster, disabled: busy }, __('Use video thumbnail', TD)) : null,
			!remote && customPoster ? el(c.Button, {
				variant: 'tertiary',
				size: 'compact',
				isDestructive: true,
				onClick: function () { resetPoster(); }
			}, __('Remove', TD)) : null
		);
		// The poster itself is the panel's default item; resetting it returns to the video's own thumbnail.
		var posterPanel = el(ToolsPanel, {
			label: __('Poster', TD),
			resetAll: function () { resetPoster(); setAttributes(pick(defs, ['alt', 'priorityLoad'])); },
			dropdownMenuProps: dropdownMenuProps
		}, [
			el(ToolsPanelItem, {
				key: 'image',
				label: __('Image', TD),
				isShownByDefault: true,
				hasValue: function () { return customPoster; },
				onDeselect: resetPoster
			}, el(VStack, { spacing: 3 }, posterBody, posterActions)),
			a.previewId || a.preview ? item('alt', __('Poster alternative text', TD), el(c.TextControl, {
				__nextHasNoMarginBottom: true,
				__next40pxDefaultSize: true,
				label: __('Poster alternative text', TD),
				help: __('Empty uses the Media Library alt text.', TD),
				autoComplete: 'off',
				value: a.alt,
				onChange: set('alt')
			}), false) : null,
			item('priorityLoad', __('Above the fold', TD), el(c.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: __('Above the fold', TD),
				help: __('For the first video on the page.', TD),
				checked: a.priorityLoad,
				onChange: set('priorityLoad')
			}), false)
		]);

		/* Source: where the video comes from, with a way to change it. */
		var sourceLabel = a.source === 'file' ? __('Media Library', TD) : providerName;
		var sourceTarget = a.source === 'file'
			? decodeURIComponent((a.fileUrl || (fileMedia && fileMedia.source_url) || '').split('/').pop() || '')
			: (a.videoUrl || pageUrl(a));
		var sourceInfo = el(VStack, { spacing: 2 },
			el('div', { className: 'slp-source-info' },
				el(c.BaseControl.VisualLabel, null, sourceLabel),
				a.source === 'file'
					? el('span', { className: 'slp-source-info__target' }, sourceTarget)
					: el(c.ExternalLink, { href: pageUrl(a), className: 'slp-source-info__target' }, sourceTarget)
			),
			el(HStack, { justify: 'flex-start' },
				el(c.Dropdown, {
					popoverProps: { placement: 'left-start', offset: 36 },
					renderToggle: function (o) {
						return el(c.Button, { variant: 'secondary', size: 'compact', onClick: o.onToggle, 'aria-expanded': o.isOpen }, __('Replace video', TD));
					},
					renderContent: renderSourceForm
				})
			)
		);

		var dur = a.duration || 0;
		var startInvalid = !!(dur && a.startAt >= dur);
		var endInvalid = a.endAt > 0 && (a.endAt <= a.startAt || !!(dur && a.endAt > dur));
		var videoPanel = panel(__('Video', TD), ['videoTitle', 'startAt', 'endAt'], [
			row('source', sourceInfo),
			item('videoTitle', __('Accessible title', TD), el(c.TextControl, Object.assign({
				label: __('Accessible title', TD),
				help: __('For screen readers. Not shown on the page.', TD),
				autoComplete: 'off',
				value: a.videoTitle,
				onChange: set('videoTitle')
			}, common))),
			isBgBlock ? null : item('startAt', __('Start time', TD), el(TimeField, {
				label: __('Start', TD),
				value: a.startAt,
				max: dur ? Math.max(0, (a.endAt || dur) - 1) : undefined,
				help: startInvalid ? __('Must be before the end.', TD) : undefined,
				onChange: set('startAt')
			}), true, 'single-column'),
			isBgBlock ? null : item('endAt', __('End time', TD), el(TimeField, {
				label: __('End', TD),
				value: a.endAt,
				min: a.startAt + 1,
				max: dur || undefined,
				placeholder: dur ? formatTime(dur) : '0:00',
				help: endInvalid ? __('Must be after the start.', TD) : undefined,
				onChange: set('endAt')
			}), true, 'single-column'),
			dur && !isBgBlock ? row('length', el('p', { className: 'slp-help' },
				sprintf(/* translators: %s: video length, e.g. 3:25. */ __('Video length: %s', TD), formatTime(dur)))) : null
		]);

		var inspector = el(Fragment, null,
			el(be.InspectorControls, null, videoPanel, posterPanel, playbackPanel, privacyPanel),
			buttonPanel ? el(be.InspectorControls, { group: 'styles' }, buttonPanel) : null,
			colorPanel
		);

		/* ── Canvas ── */
		if (isBgBlock) {
			var stage = el('div', { className: 'slp-stage', 'aria-hidden': 'true' },
				el('div', { className: 'slp-media' }, media),
				frame,
				el('span', { className: 'slp-bg__overlay' })
			);
			return el(Fragment, null, toolbar, inspector,
				el('div', innerProps, stage, innerProps.children, busy ? el('div', { className: 'slp-busy' }, el(c.Spinner)) : null)
			);
		}
		var canvas = el('figure', blockProps,
			el('div', { className: 'slp-stage' },
				el('div', { className: 'slp-media' }, media),
				frame,
				mode !== 'background'
					? el('span', { className: 'slp-play space-lightplay-btn', 'aria-hidden': 'true' }, el('span', { className: 'slp-play__icon space-lightplay-icon' }, playTriangle))
					: null,
				el('div', innerProps),
				busy ? el('div', { className: 'slp-busy' }, el(c.Spinner)) : null
			)
		);

		return el(Fragment, null, toolbar, inspector, canvas);
	}

	function TimeField(props) {
		var st = useState(formatTime(props.value));
		var text = st[0], setText = st[1];
		useEffect(function () { setText(formatTime(props.value)); }, [props.value]);
		return el(c.TextControl, {
			__nextHasNoMarginBottom: true,
			__next40pxDefaultSize: true,
			label: props.label,
			help: props.help,
			placeholder: props.placeholder || '0:00',
			// No browser autofill history (it pops up over the field and suggests unrelated text).
			autoComplete: 'off',
			spellCheck: false,
			value: text,
			onChange: setText,
			onBlur: function () {
				var n = parseTime(text);
				if (n && props.max !== undefined && n > props.max) n = props.max;
				if (n && props.min !== undefined && n < props.min) n = props.min;
				setText(formatTime(n));
				props.onChange(n);
			}
		});
	}

	/* ─────────────── Deprecation: 1.x → 2.0 ─────────────── */

	var LEGACY_PRESETS = {
		minimal: { btnSize: '56px', btnBg: 'rgba(0,0,0,.35)', btnBgHover: 'rgba(0,0,0,.55)' },
		bold: { btnSize: '104px', btnBg: '#000', btnBgHover: '#000' },
		glass: { btnBg: 'rgba(255,255,255,.18)', btnBgHover: 'rgba(255,255,255,.28)', iconColor: '#fff', btnBlur: 8 }
	};
	var LEGACY_STYLE_RE = /(?:^|\s)is-style-(minimal|bold|glass)(?:\s|$)/;

	var v1 = {
		attributes: {
			videoId: { type: 'string', default: '' },
			videoUrl: { type: 'string', default: '' },
			videoTitle: { type: 'string', default: '' },
			preview: { type: 'string', default: '' },
			previewId: { type: 'number', default: 0 },
			alt: { type: 'string', default: '' },
			startAt: { type: 'number', default: 0 },
			aspectRatio: { type: 'string' },
			priorityLoad: { type: 'boolean', default: false },
			btnSize: { type: 'string', default: '80px' },
			btnRadius: { type: 'string', default: '50%' },
			btnBg: { type: 'string', default: 'rgba(0,0,0,.55)' },
			btnBgHover: { type: 'string', default: 'rgba(0,0,0,.7)' },
			iconColor: { type: 'string', default: '#ffffff' },
			iconColorHover: { type: 'string', default: '#ffffff' },
			iconCornerRadius: { type: 'number', default: 0 },
			pulse: { type: 'boolean', default: false },
			preferMaxQuality: { type: 'boolean' }
		},
		supports: { html: false, align: ['wide', 'full'], spacing: { margin: true }, anchor: true },
		save: function () { return null; },
		isEligible: function (attrs) {
			return attrs.aspectRatio !== undefined || attrs.preferMaxQuality !== undefined || LEGACY_STYLE_RE.test(attrs.className || '');
		},
		migrate: function (attrs) {
			// Migrated attributes don't receive defaults for attributes added in 2.0 — merge them in.
			var out = Object.assign({}, defaultsOf(VIDEO), attrs, { source: 'youtube' });
			if (out.aspectRatio) {
				var style = Object.assign({}, out.style);
				style.dimensions = Object.assign({}, style.dimensions, { aspectRatio: String(out.aspectRatio).replace(/\s+/g, '') });
				out.style = style;
			}
			delete out.aspectRatio;
			delete out.preferMaxQuality;
			var m = (out.className || '').match(LEGACY_STYLE_RE);
			if (m) {
				Object.assign(out, LEGACY_PRESETS[m[1]]);
				out.className = out.className.replace(LEGACY_STYLE_RE, ' ').trim() || undefined;
			}
			return out;
		}
	};

	/* ──────────── Video ⇄ Background transforms ────────────
	 * Nothing is thrown away:
	 *  - settings both blocks share are copied;
	 *  - settings only one block has are kept in a hidden `stash` and restored on the way back;
	 *  - Video → Background: the end screen's blocks become the content on top of the video;
	 *  - Background → Video: the content goes back into the end screen if it came from there,
	 *    otherwise it is placed right below the video.
	 * A snackbar explains what happened and offers Undo.
	 */
	var SHARED_KEYS = ['source', 'videoUrl', 'videoId', 'vimeoHash', 'fileId', 'fileUrl', 'videoTitle', 'videoRatio', 'duration',
		'startAt', 'endAt', 'preview', 'previewId', 'previewAuto', 'alt', 'priorityLoad', 'consent', 'consentRemember', 'consentText',
		'panelBg', 'panelText', 'playerBg', 'align', 'anchor', 'className', 'lock', 'metadata'];
	// Style paths both blocks support; everything else in `style` belongs to one block only.
	var SHARED_STYLE = [['border'], ['shadow'], ['spacing', 'margin'], ['dimensions', 'aspectRatio'], ['dimensions', 'width']];

	function getPath(o, path) {
		return path.reduce(function (acc, k) { return acc && acc[k] !== undefined ? acc[k] : undefined; }, o);
	}
	function setPath(o, path, v) {
		var cur = o;
		path.forEach(function (k, i) {
			if (i === path.length - 1) { cur[k] = v; return; }
			cur[k] = Object.assign({}, cur[k]);
			cur = cur[k];
		});
	}
	function splitStyle(style) {
		var shared = {};
		var own = JSON.parse(JSON.stringify(style || {}));
		SHARED_STYLE.forEach(function (path) {
			var v = getPath(style, path);
			if (v === undefined) return;
			setPath(shared, path, v);
			var parent = getPath(own, path.slice(0, -1)) || own;
			delete parent[path[path.length - 1]];
		});
		Object.keys(own).forEach(function (k) {
			if (own[k] && typeof own[k] === 'object' && !Object.keys(own[k]).length) delete own[k];
		});
		return { shared: shared, own: own };
	}
	function mergeStyle(a, b) {
		var out = JSON.parse(JSON.stringify(a || {}));
		Object.keys(b || {}).forEach(function (k) {
			out[k] = (out[k] && typeof out[k] === 'object' && typeof b[k] === 'object') ? Object.assign({}, out[k], b[k]) : b[k];
		});
		return Object.keys(out).length ? out : undefined;
	}
	/** Returns { shared, own } where `own` is what only this block understands. */
	function splitAttributes(attrs) {
		var shared = {};
		var own = {};
		Object.keys(attrs).forEach(function (k) {
			if (k === 'stash' || k === 'style' || attrs[k] === undefined) return;
			(SHARED_KEYS.indexOf(k) > -1 ? shared : own)[k] = attrs[k];
		});
		var st = splitStyle(attrs.style);
		if (Object.keys(st.shared).length) shared.style = st.shared;
		if (Object.keys(st.own).length) own.style = st.own;
		return { shared: shared, own: own };
	}
	function combine(parts, stash) {
		var restored = Object.assign({}, stash || {});
		var extra = { endScreen: restored._endScreen };
		delete restored._endScreen;
		delete restored._notice;
		var out = Object.assign({}, parts.shared, restored);
		out.style = mergeStyle(parts.shared.style, restored.style);
		return { attributes: out, extra: extra };
	}

	function videoToBackground(attrs, innerBlocks) {
		var parts = splitAttributes(attrs);
		var built = combine(parts, attrs.stash);
		var end = (innerBlocks || []).filter(function (b) { return b.name === END; })[0];
		var stash = Object.assign({}, parts.own);
		var content = [];
		if (end) {
			stash._endScreen = end.attributes;
			content = end.innerBlocks.map(function (b) { return blocks.cloneBlock(b); });
		}
		stash._notice = end && content.length ? 'bg-from-end' : 'bg';
		built.attributes.stash = stash;
		return blocks.createBlock(BG, built.attributes, content);
	}

	function backgroundToVideo(attrs, innerBlocks) {
		var parts = splitAttributes(attrs);
		var built = combine(parts, attrs.stash);
		var content = (innerBlocks || []).map(function (b) { return blocks.cloneBlock(b); })
			.filter(function (b) { return !(b.name === 'core/paragraph' && !b.attributes.content); });
		var stash = Object.assign({}, parts.own);
		if (!built.attributes.mode || built.attributes.mode === 'background') built.attributes.mode = 'click';
		if (built.extra.endScreen) {
			// The content came from the end screen: put it back there.
			stash._notice = 'video-to-end';
			built.attributes.stash = stash;
			return blocks.createBlock(VIDEO, built.attributes, [blocks.createBlock(END, built.extra.endScreen, content)]);
		}
		stash._notice = content.length ? 'video-content-below' : 'video';
		built.attributes.stash = stash;
		return [blocks.createBlock(VIDEO, built.attributes)].concat(content);
	}

	var TRANSFORM_NOTICES = {
		'bg': __('Converted to Background. Video-only settings are kept for converting back.', TD),
		'bg-from-end': __('Converted to Background. The end screen content is now on top of the video.', TD),
		'video': __('Converted to Video. Background-only settings are kept for converting back.', TD),
		'video-content-below': __('Converted to Video. The content that was on top is now below the video.', TD),
		'video-to-end': __('Converted to Video. The content is back in the end screen.', TD)
	};

	/** After a transform: explain what happened, with Undo. Never in previews. */
	function useTransformNotice(props) {
		var key = props.attributes.stash && props.attributes.stash._notice;
		var isPreview = useSelect(function (select) { return !!select(be.store).getSettings().isPreviewMode; }, []);
		var editorDispatch = useDispatch(be.store);
		useEffect(function () {
			if (!key || isPreview) return;
			var stash = Object.assign({}, props.attributes.stash);
			delete stash._notice;
			// Clearing the flag must not add its own undo step.
			editorDispatch.__unstableMarkNextChangeAsNotPersistent();
			props.setAttributes({ stash: stash });
			var editorStore = wp.data.dispatch('core/editor');
			wp.data.dispatch('core/notices').createInfoNotice(TRANSFORM_NOTICES[key] || '', {
				type: 'snackbar',
				id: 'space-lightplay-transform',
				actions: editorStore && editorStore.undo ? [{ label: __('Undo', TD), onClick: function () { editorStore.undo(); } }] : []
			});
		}, [key, isPreview]);
	}

	/** File URL of a Media Library video, also for blocks that stored only its ID. */
	function fileUrlOf(attrs) {
		if (attrs.fileUrl) return attrs.fileUrl;
		if (!attrs.fileId) return '';
		var media = wp.data.select('core').getMedia(attrs.fileId, { context: 'view' });
		return (media && media.source_url) || '';
	}

	/* core/cover ⇄ Background (core/cover can only use self-hosted video). */
	function coverToBackground(attrs, innerBlocks) {
		var style = JSON.parse(JSON.stringify(attrs.style || {}));
		if (attrs.minHeight) setPath(style, ['dimensions', 'minHeight'], attrs.minHeight + (attrs.minHeightUnit || 'px'));
		return blocks.createBlock(BG, {
			source: 'file',
			fileId: attrs.id || 0,
			fileUrl: attrs.url,
			overlayColor: attrs.customOverlayColor || '',
			overlayGradient: attrs.customGradient || '',
			overlayOpacity: attrs.dimRatio !== undefined ? attrs.dimRatio : 50,
			align: attrs.align,
			anchor: attrs.anchor,
			className: attrs.className,
			style: Object.keys(style).length ? style : undefined
		}, (innerBlocks || []).map(function (b) { return blocks.cloneBlock(b); }));
	}
	function backgroundToCover(attrs, innerBlocks) {
		var style = JSON.parse(JSON.stringify(attrs.style || {}));
		var minHeight = getPath(style, ['dimensions', 'minHeight']);
		var m = String(minHeight || '').match(/^([\d.]+)([a-z%]+)$/);
		if (style.dimensions) { delete style.dimensions.minHeight; delete style.dimensions.aspectRatio; }
		return blocks.createBlock('core/cover', {
			url: attrs.fileUrl,
			id: attrs.fileId || undefined,
			backgroundType: 'video',
			dimRatio: attrs.overlayOpacity,
			customOverlayColor: attrs.overlayColor || undefined,
			customGradient: attrs.overlayGradient || undefined,
			minHeight: m ? parseFloat(m[1]) : undefined,
			minHeightUnit: m ? m[2] : undefined,
			align: attrs.align,
			anchor: attrs.anchor,
			className: attrs.className,
			style: Object.keys(style).length ? style : undefined
		}, (innerBlocks || []).map(function (b) { return blocks.cloneBlock(b); }));
	}

	/* ─────────────────────── Register ─────────────────────── */

	blocks.registerBlockType(VIDEO, {
		icon: ICON_VIDEO,
		edit: VideoEdit,
		save: function () { return el(be.InnerBlocks.Content); },
		deprecated: [v1],
		transforms: {
			from: [{
				type: 'block',
				blocks: ['core/video'],
				isMatch: function (attrs) { return !!attrs.src; },
				transform: function (attrs) {
					return blocks.createBlock(VIDEO, {
						source: 'file',
						fileId: attrs.id || 0,
						fileUrl: attrs.src,
						preview: attrs.poster || '',
						previewAuto: false,
						videoRatio: ratioFromSize(attrs.width, attrs.height),
						align: attrs.align,
						anchor: attrs.anchor,
						className: attrs.className
					});
				}
			}, {
				type: 'block',
				blocks: ['core/embed'],
				isMatch: function (attrs) {
					var p = parseVideoUrl(attrs && attrs.url);
					return !!(p && (!attrs.providerNameSlug || attrs.providerNameSlug === p.source));
				},
				transform: function (attrs) {
					var p = parseVideoUrl(attrs.url);
					return blocks.createBlock(VIDEO, {
						source: p.source,
						videoUrl: attrs.url,
						videoId: p.id,
						vimeoHash: p.hash || '',
						startAt: p.start || 0,
						videoRatio: p.short ? '9/16' : '',
						previewAuto: true
					});
				}
			}],
			to: [{
				type: 'block',
				blocks: [BG],
				transform: videoToBackground
			}, {
				// core/video only plays self-hosted files, so this appears for Media Library videos.
				type: 'block',
				blocks: ['core/video'],
				isMatch: function (attrs) { return attrs.source === 'file' && !!fileUrlOf(attrs); },
				transform: function (attrs) {
					return blocks.createBlock('core/video', {
						src: fileUrlOf(attrs),
						id: attrs.fileId || undefined,
						poster: attrs.preview || undefined,
						align: attrs.align,
						anchor: attrs.anchor,
						className: attrs.className
					});
				}
			}, {
				type: 'block',
				blocks: ['core/embed'],
				isMatch: function (attrs) { return attrs.source !== 'file' && !!attrs.videoId; },
				transform: function (attrs) {
					var url = attrs.videoUrl || pageUrl(attrs);
					if (attrs.startAt && url.indexOf('t=') === -1) {
						url += attrs.source === 'vimeo' ? '#t=' + attrs.startAt + 's' : (url.indexOf('?') === -1 ? '?' : '&') + 't=' + attrs.startAt + 's';
					}
					return blocks.createBlock('core/embed', { url: url, providerNameSlug: attrs.source, type: 'video' });
				}
			}]
		}
	});

	function EndEdit(props) {
		var a = props.attributes;
		var setAttributes = props.setAttributes;
		var active = useSelect(function (select) {
			var s = select(be.store);
			return s.isBlockSelected(props.clientId) || s.hasSelectedInnerBlock(props.clientId, true);
		}, [props.clientId]);
		var hasChildren = useSelect(function (select) {
			return select(be.store).getBlockCount(props.clientId) > 0;
		}, [props.clientId]);

		var innerProps = be.useInnerBlocksProps(be.useBlockProps({ className: 'slp-end' + (active ? ' is-active' : '') }), {
			templateLock: false,
			renderAppender: hasChildren ? undefined : be.InnerBlocks.ButtonBlockAppender
		});

		var inspector = el(be.InspectorControls, null,
				el(ToolsPanel, {
					label: __('Replay button', TD),
					resetAll: function () { setAttributes({ showReplay: true, replayLabel: '' }); }
				},
					el(ToolsPanelItem, {
						label: __('Show replay button', TD),
						isShownByDefault: true,
						hasValue: function () { return a.showReplay !== true; },
						onDeselect: function () { setAttributes({ showReplay: true }); }
					}, el(c.ToggleControl, { __nextHasNoMarginBottom: true, label: __('Show replay button', TD), checked: a.showReplay, onChange: function (v) { setAttributes({ showReplay: v }); } })),
					a.showReplay ? el(ToolsPanelItem, {
						label: __('Button text', TD),
						isShownByDefault: true,
						hasValue: function () { return !!a.replayLabel; },
						onDeselect: function () { setAttributes({ replayLabel: '' }); }
					}, el(c.TextControl, { __nextHasNoMarginBottom: true, __next40pxDefaultSize: true, autoComplete: 'off', label: __('Button text', TD), placeholder: __('Replay', TD), value: a.replayLabel, onChange: function (v) { setAttributes({ replayLabel: v }); } })) : null
				)
			);

		var replay = a.showReplay
			? el('span', { className: 'slp-replay', 'aria-hidden': 'true' }, replayIcon, el('span', null, a.replayLabel || __('Replay', TD)))
			: null;

		return el(Fragment, null, inspector, el('div', innerProps, innerProps.children, replay));
	}

	blocks.registerBlockType(BG, {
		icon: ICON_BACKGROUND,
		edit: VideoEdit,
		save: function () { return el(be.InnerBlocks.Content); },
		transforms: {
			from: [{
				type: 'block',
				blocks: ['core/cover'],
				isMatch: function (attrs) { return attrs.backgroundType === 'video' && !!attrs.url; },
				transform: coverToBackground
			}],
			to: [{
				type: 'block',
				blocks: [VIDEO],
				transform: backgroundToVideo
			}, {
				type: 'block',
				blocks: ['core/cover'],
				isMatch: function (attrs) { return attrs.source === 'file' && !!fileUrlOf(attrs); },
				transform: function (attrs, inner) { return backgroundToCover(Object.assign({}, attrs, { fileUrl: fileUrlOf(attrs) }), inner); }
			}]
		}
	});

	blocks.registerBlockType(END, {
		icon: ICON_END,
		edit: EndEdit,
		save: function () { return el(be.InnerBlocks.Content); }
	});
})(window.wp);
