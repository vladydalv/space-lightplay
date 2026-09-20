=== Space Lightplay ===
Contributors: wpspacenerd
Donate link: https://www.spacenerd.space/
Tags: video, youtube, vimeo, background video, lazy load
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Fast YouTube, Vimeo and self-hosted video blocks: click-to-play, lightbox and background video. Nothing heavy loads until it's needed.

== Description ==

A standard video embed loads a full player — scripts, iframes, trackers — the moment the page opens, even if nobody presses Play. Space Lightplay shows a crisp poster instead and loads the player only when the visitor wants it. Your pages stay fast, and nothing is sent to YouTube or Vimeo before it has to be.

The plugin adds two blocks that work with **YouTube** (including Shorts), **Vimeo** (including unlisted videos) and **videos from your Media Library**.

= Space Lightplay — the video block =

A poster with a play button that turns into the player on click.

* **Open in lightbox** — play the video in a full-screen dialog over the page.
* **Autoplay when in view** — starts muted when the video scrolls into view and pauses when it leaves. Optionally tries to play with sound.
* **Start and end time** — play just a part of the video. The fields know the video's length, so values can't go past its end, and replays keep the same segment.
* **End screen** — show a call to action, links or the next video when playback ends, built from regular blocks, with an optional Replay button.
* **One at a time** — starting one video pauses the others on the page.

= Space Lightplay Background — the background video block =

Like the core Cover block, but it also works with YouTube and Vimeo — Cover only supports self-hosted video.

* Muted, looping, no controls — a clean background behind any blocks you add on top.
* Plays only while in view.
* Optional "poster only" on phones: nothing is loaded on small screens, saving your visitors' mobile data.
* Overlay colour or gradient with opacity, content alignment, minimum height, padding and text colour — all native editor controls.

= Switch freely between blocks =

Convert Video ⇄ Background from the block toolbar. Nothing gets lost on the way: settings the other block doesn't have are kept for converting back, and your content moves with the block. A notice explains what happened and offers Undo.

Core blocks work too: YouTube and Vimeo Embed blocks convert to Space Lightplay and back, and for Media Library videos the Video block ⇄ core Video and the Background block ⇄ core Cover. Settings the core block has no place for (such as the play button design) are not carried over.

= Sharp posters, stored on your site =

* When you add a YouTube or Vimeo video, its thumbnail is copied into your Media Library in the highest resolution the provider has — including YouTube's WebP set, which often has an HD frame when the JPEG set doesn't.
* Low-resolution frames are cropped to remove YouTube's black bars.
* Prefer your own image? Pick any poster from the Media Library. WordPress serves the right size to every screen, including Retina. Media Library videos without a poster show their first frame.
* The sidebar shows the poster's size, and explains why if a local copy couldn't be saved.

= Privacy =

* Posters come from your own site. Visitors' browsers contact YouTube or Vimeo only when they are about to play: on hover the connection is warmed up to start faster, and with the consent notice on, nothing is contacted until the visitor agrees.
* Optional "ask before loading" notice per video, with an "Always allow" choice and a link to your privacy policy.
* YouTube plays in privacy-enhanced mode (youtube-nocookie.com), Vimeo with do-not-track.

= Designed in the editor =

Everything is set with WordPress's own controls — no custom panels to learn.

* Alignments (left, center, right, wide, full), width (on WordPress versions that have the Width control), aspect ratio, border, radius, shadow and margin.
* The aspect ratio is detected from the video and snapped to a standard format (16:9, 9:16, 4:3…).
* Play button: size, radius, icon roundness, background blur and a pulse on hover.
* Colours from your theme palette, with transparency and separate Default/Hover values for the button and icon.
* Hover overlay colour or gradient with its own opacity slider, just like the Cover block's overlay.

= Light by design =

* About 7 KB of CSS and JS (gzipped) on the page before anyone presses Play.
* The lightbox and autoplay scripts load only on pages that use them.
* The YouTube or Vimeo player API loads only when it's needed: an end screen, start/end times, autoplay, or several videos on the page. A single simple video loads just the player.
* Connections to the provider warm up on hover, unless a consent notice is still waiting.

= Accessible =

* Keyboard-friendly play button with a descriptive label, and an accessible title for every player.
* Visitors who prefer reduced motion get no autoplay.
* The lightbox is a native dialog: Escape closes it and focus returns to the page.
* No video autoplays when the browser asks to save data.

== Installation ==

1. In your dashboard, go to Plugins → Add New, search for "Space Lightplay" and click Install, then Activate.
2. In the editor, add the **Space Lightplay** block for a video, or **Space Lightplay Background** for a background video.
3. Paste a YouTube or Vimeo link, or choose a video from the Media Library. The poster is prepared automatically.

== Frequently Asked Questions ==

= Does anything load before the visitor presses Play? =

Only the poster image, served from your own site, plus about 7 KB of CSS and JS. With "Autoplay when in view" and in the Background block, the player loads when the block comes into view.

= Can I use a YouTube video as a background? =

Yes. That's what the Space Lightplay Background block is for — YouTube, Vimeo or a video from your Media Library, with any blocks on top.

= Why is the poster no larger than 1280 px? =

That's the largest thumbnail YouTube provides for any video, even 4K ones. For a razor-sharp full-width poster on Retina screens, upload your own image as the poster.

= Why does "Try with sound" sometimes start muted? =

Browsers only allow sound without a click after the visitor has interacted with the page. Otherwise the video starts muted, with a "Turn sound on" button.

= Vimeo background videos still show controls. =

Vimeo hides its player controls in background mode only for videos on a paid Vimeo plan.

= I'm upgrading from 1.x — will my blocks break? =

No. Existing blocks look the same, and the 1.x CSS classes (space-lightplay-btn, space-lightplay-icon, space-lightplay-iframe, space-lightplay-placeholder, is-playing) are still on the same elements, so theme customisations keep working. When you open a post in the editor, the old aspect ratio moves to the native control and the removed Minimal/Bold/Glass styles become regular button settings.

= Does the plugin work with any theme? =

Yes, block themes and classic themes alike. The aspect ratio, border radius and width controls are enabled for these blocks even if your theme doesn't turn them on.

= Will removing the plugin leave anything in my database? =

No options, tables or transients are created. Posters copied into the Media Library stay there as regular images; only the plugin's own bookkeeping data on them is removed.

== Upgrade Notice ==

= 2.0.0 =
Big update: Vimeo and self-hosted video, lightbox, autoplay when in view, start/end time, end screen, a new Background video block, consent notice and HD local posters. Requires WordPress 6.5+. Existing 1.x blocks keep working.

== Changelog ==

= 2.0.0 =
* New: Space Lightplay Background block — YouTube, Vimeo or self-hosted video behind any blocks, with lossless conversion to and from the Video block and core Cover.
* New: Vimeo and Media Library video sources.
* New: playback options — open in lightbox, autoplay when in view (with optional sound).
* New: End screen built from regular blocks, with a Replay button.
* New: end time — playback stops there and the end screen appears.
* New: optional consent notice before loading YouTube/Vimeo.
* New: poster copied into the Media Library automatically; responsive srcset for posters.
* Improved: posters use the highest-resolution frame YouTube has (1280 px), including its WebP set, which often has an HD frame when the JPEG set doesn't; lower-resolution frames are cropped to remove black bars.
* New: hover overlay with colour or gradient and a separate opacity slider, like the core Cover block (replaces the fixed 1.x darkening; same look by default).
* New: convert to and from core Video (Media Library videos) and core Embed for Vimeo as well as YouTube.
* New: pause other videos when one starts.
* New: all block alignments like the core Embed block (left, center, right, wide, full) and the native Width control.
* New: play button blur; all colours in the Styles tab with theme palette, transparency and Default/Hover tabs.
* New: native aspect ratio, border, shadow and margin controls; automatic ratio from the video (Shorts = 9:16).
* New: player background colour (visible when the block's aspect ratio differs from the video's).
* New: Background block can show only the poster on phones; no autoplay when the browser asks to save data or the visitor prefers reduced motion.
* Improved: video aspect ratio detected automatically and snapped to standard ratios (16:9, 9:16, 4:3…).
* Improved: poster panel in the sidebar shows the image size and why a local copy could not be saved.
* Compatibility: tested with WordPress 7.1 — block API v3 and the iframe-based editor.
* Changed: block styles Minimal/Bold/Glass replaced by settings (migrated automatically).
* Changed: requires WordPress 6.5.
* Kept: 1.x CSS classes (space-lightplay-btn, space-lightplay-icon, space-lightplay-iframe, space-lightplay-placeholder, is-playing) stay on the same elements, so theme customisations keep working.
* Removed: "prefer maximum quality thumbnail" (the best available size is always used).

= 1.1.0 =
* Fixed: frontend colours not applying when chosen via the native WordPress colour picker (alpha values, CSS variables, and rgba with spaces are now accepted).
* Fixed: wide and full alignment now respect the active theme's container width instead of stretching to the page viewport. Block themes and classic themes both work correctly.
* Fixed: play triangle is now optically centred regardless of button shape and stays the same visible size when corner roundness is adjusted.
* New: aspect ratio control — 16:9, 4:3, 1:1, 9:16 (vertical/Shorts), 21:9 cinematic.
* New: start time (timecode) — set in seconds, or paste a URL with ?t=… and it auto-fills.
* New: above-the-fold mode — disables lazy-load on the preview image for hero videos to improve LCP.
* New: hover-prefetch — preconnect to YouTube on hover/focus/touch, so the iframe loads faster on click. Always on, zero config.
* New: block style variations — Minimal, Bold, Glass.
* New: triangle corner roundness control — round the tips of the play icon.
* New: optional accessible title for the video iframe — describes the video to screen readers.
* New: alpha-channel support on background colour pickers.
* New: block transforms — convert from a core/embed YouTube block to Space Lightplay and back in one click.
* New: spacing (margin) and HTML anchor block supports.
* New: RTL support for the play triangle.
* New: translations directory and `.pot` file for the WordPress.org translation community.
* Improved: block wrapper now uses semantic `&lt;figure&gt;` element instead of `&lt;div&gt;` — better for accessibility, screen readers, and content parsers. Existing CSS targeting the `.space-lightplay` class is unaffected; spacing controls in the editor continue to work.

= 1.0.0 =
* Initial release.