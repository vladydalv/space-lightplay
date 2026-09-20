<?php
/**
 * Rendering shared by the Video and Background blocks.
 *
 * @package Space_Lightplay
 */

defined( 'ABSPATH' ) || exit;

/**
 * Normalises a block's video settings.
 *
 * @param array    $attributes Block attributes.
 * @param WP_Block $block      Block instance.
 * @param string   $mode       click | lightbox | scroll | background.
 * @return array|null Null when the block has no playable video.
 */
function space_lightplay_prepare( $attributes, $block, $mode ) {
	$raw = isset( $block->parsed_block['attrs'] ) && is_array( $block->parsed_block['attrs'] ) ? $block->parsed_block['attrs'] : array();

	// 1.x posts not yet re-saved: apply removed block-style presets.
	$attributes = array_merge( $attributes, space_lightplay_legacy_style_preset( $raw['className'] ?? '' ) );

	$source = in_array( $attributes['source'] ?? '', array( 'youtube', 'vimeo', 'file' ), true ) ? $attributes['source'] : 'youtube';
	$vid    = trim( (string) ( $attributes['videoId'] ?? '' ) );
	$hash   = preg_replace( '/[^A-Za-z0-9]/', '', (string) ( $attributes['vimeoHash'] ?? '' ) );
	$file   = '';

	if ( 'file' === $source ) {
		$file = ! empty( $attributes['fileId'] ) ? wp_get_attachment_url( (int) $attributes['fileId'] ) : '';
		if ( ! $file ) {
			$file = esc_url_raw( (string) ( $attributes['fileUrl'] ?? '' ) );
		}
		if ( ! $file ) {
			return null;
		}
	} elseif ( ! space_lightplay_valid_id( $source, $vid ) ) {
		return null;
	}

	$remote   = 'file' !== $source;
	$consent  = $remote && ! empty( $attributes['consent'] );
	$title    = trim( (string) ( $attributes['videoTitle'] ?? '' ) );
	$start    = max( 0, min( 86400, (int) ( $attributes['startAt'] ?? 0 ) ) );
	$end_at   = (int) ( $attributes['endAt'] ?? 0 );
	$duration = (int) ( $attributes['duration'] ?? 0 );
	if ( $duration && $start >= $duration ) {
		$start = 0;
	}
	$end_at = ( $end_at > $start && ( ! $duration || $end_at <= $duration ) ) ? min( 86400, $end_at ) : 0;
	// Background video always loops the whole video. Start/End may still be stored
	// (kept from a Video block for converting back) but must not stop the loop.
	if ( 'background' === $mode ) {
		$start  = 0;
		$end_at = 0;
	}

	// Ratio of the video itself; the block's own aspect ratio (native support) may differ.
	$legacy_ratio = isset( $raw['aspectRatio'] ) ? space_lightplay_sanitize_aspect_ratio( $raw['aspectRatio'], '' ) : '';
	$video_ratio  = space_lightplay_sanitize_aspect_ratio( $attributes['videoRatio'] ?? '', '' );
	// Snap raw sizes saved by earlier builds (e.g. "200/113") to the standard ratio.
	if ( preg_match( '/^(\d+)\/(\d+)$/', $video_ratio, $rm ) ) {
		$video_ratio = space_lightplay_ratio_from_size( $rm[1], $rm[2] );
	}
	$video_ratio = $video_ratio ? $video_ratio : ( $legacy_ratio ? $legacy_ratio : '16/9' );
	$block_ratio = $legacy_ratio && empty( $attributes['style']['dimensions']['aspectRatio'] ) ? $legacy_ratio : $video_ratio;

	$vars = array(
		'--slp-ratio'       => str_replace( '/', ' / ', $block_ratio ),
		'--slp-video-ratio' => str_replace( '/', ' / ', $video_ratio ),
	);
	if ( isset( $attributes['overlayOpacity'] ) ) {
		$vars['--slp-overlay-opacity'] = max( 0, min( 100, (int) $attributes['overlayOpacity'] ) ) / 100;
	}
	// Colours: only what the user set. Unset ones fall back to the defaults in style.css.
	$color_vars = array(
		'btnBg'            => '--slp-btn-bg',
		'btnBgHover'       => '--slp-btn-bg-hover',
		'iconColor'        => '--slp-icon',
		'iconColorHover'   => '--slp-icon-hover',
		'panelBg'          => '--slp-panel-bg',
		'panelText'        => '--slp-panel-text',
		'lightboxBackdrop' => '--slp-lightbox-backdrop',
		'playerBg'         => '--slp-player-bg',
		'overlayColor'     => '--slp-overlay',
	);
	foreach ( $color_vars as $attr => $prop ) {
		$clean = space_lightplay_sanitize_css_color( $attributes[ $attr ] ?? '', '' );
		if ( '' !== $clean ) {
			$vars[ $prop ] = $clean;
		}
	}
	$overlay_gradient = space_lightplay_sanitize_css_gradient( $attributes['overlayGradient'] ?? '' );
	if ( '' !== $overlay_gradient ) {
		$vars['--slp-overlay'] = $overlay_gradient;
	}

	// Poster.
	$priority = ! empty( $attributes['priorityLoad'] );
	$loading  = $priority ? 'eager' : 'lazy';
	$alt      = (string) ( $attributes['alt'] ?? '' );
	$img_args = array(
		'class'    => 'slp-poster',
		'loading'  => $loading,
		'decoding' => 'async',
	);
	if ( $priority ) {
		$img_args['fetchpriority'] = 'high';
	}
	if ( '' !== $alt ) {
		$img_args['alt'] = $alt;
	}
	$poster = '';
	if ( ! empty( $attributes['previewId'] ) ) {
		$poster = wp_get_attachment_image( (int) $attributes['previewId'], 'full', false, $img_args );
	}
	if ( ! $poster && ! empty( $attributes['preview'] ) ) {
		$poster = sprintf(
			'<img class="slp-poster" src="%s" alt="%s" loading="%s" decoding="async"%s />',
			esc_url( $attributes['preview'] ),
			esc_attr( $alt ),
			esc_attr( $loading ),
			$priority ? ' fetchpriority="high"' : ''
		);
	}
	// Remote thumbnail only when no consent gate is required (1.x behaviour).
	if ( ! $poster && 'youtube' === $source && ! $consent ) {
		// Largest first; view.js walks down the list when YouTube has no such frame.
		$thumbs = space_lightplay_youtube_thumbnails( $vid );
		$poster = sprintf(
			'<img class="slp-poster space-lightplay-placeholder" src="%s" data-fallback="%s" alt="" loading="%s" decoding="async" />',
			esc_url( array_shift( $thumbs ) ),
			esc_attr( implode( ' ', $thumbs ) ),
			esc_attr( $loading )
		);
	}
	if ( ! $poster && 'file' === $source && 'background' !== $mode ) {
		$poster = sprintf( '<video class="slp-poster" src="%s#t=0.1" preload="metadata" muted playsinline aria-hidden="true"></video>', esc_url( $file ) );
	}

	$provider  = space_lightplay_provider_label( $source );
	$watch_url = 'youtube' === $source
		? 'https://www.youtube.com/watch?v=' . $vid . ( $start ? '&t=' . $start . 's' : '' )
		: ( 'vimeo' === $source ? 'https://vimeo.com/' . $vid . ( $hash ? '/' . $hash : '' ) : $file );

	$stage_style = '';
	foreach ( $vars as $prop => $val ) {
		$stage_style .= $prop . ':' . $val . ';';
	}

	// Core's "Original" aspect ratio is `auto`; for these blocks it means the video's own ratio.
	$ratio_class = ( isset( $attributes['style']['dimensions']['aspectRatio'] ) && 'auto' === $attributes['style']['dimensions']['aspectRatio'] ) ? ' slp-ratio-auto' : '';

	return array(
		'ratio_class' => $ratio_class,
		'attributes'  => $attributes,
		'source'      => $source,
		'provider'    => $provider,
		'consent'     => $consent,
		'title'       => $title,
		'vars'        => $vars,
		'stage_style' => $stage_style,
		'poster'      => $poster,
		'watch_url'   => $watch_url,
		// The wrapper style passes through core's CSS filter, which drops custom
		// properties holding functions like rgba(); only the ratio goes there.
		'ratio_style' => '--slp-ratio:' . $vars['--slp-ratio'] . ';',
		'data'        => array(
			'data-source'  => $source,
			'data-id'      => $remote ? $vid : '',
			'data-hash'    => $hash,
			'data-src'     => $file ? esc_url_raw( $file ) : '',
			'data-start'   => (string) $start,
			'data-end'     => $end_at ? (string) $end_at : '',
			'data-mode'    => $mode,
			'data-consent' => $consent ? '1' : '0',
			'data-title'   => $title ? $title : __( 'Video player', 'space-lightplay' ),
		),
	);
}

/**
 * Consent notice markup (hidden until needed).
 *
 * @param array $ctx Prepared context.
 * @return string
 */
function space_lightplay_consent_html( $ctx ) {
	if ( ! $ctx['consent'] ) {
		return '';
	}
	$attributes = $ctx['attributes'];
	$provider   = $ctx['provider'];
	ob_start();
	?>
	<div class="slp-consent" role="region" aria-label="<?php esc_attr_e( 'External content', 'space-lightplay' ); ?>" hidden>
		<p class="slp-consent__text">
			<?php
			if ( '' !== trim( (string) ( $attributes['consentText'] ?? '' ) ) ) {
				echo wp_kses( $attributes['consentText'], array( 'a' => array( 'href' => true, 'target' => true, 'rel' => true ), 'strong' => array(), 'em' => array(), 'br' => array() ) );
			} else {
				/* translators: %s: provider name, e.g. YouTube. */
				echo esc_html( sprintf( __( 'This video is hosted by %1$s. Loading it will send data to %1$s.', 'space-lightplay' ), $provider ) );
			}
			$policy = get_privacy_policy_url();
			if ( $policy ) {
				echo ' <a href="' . esc_url( $policy ) . '">' . esc_html__( 'Privacy policy', 'space-lightplay' ) . '</a>';
			}
			?>
		</p>
		<div class="slp-consent__actions">
			<button type="button" class="slp-consent__accept">
				<?php
				/* translators: %s: provider name. */
				echo esc_html( sprintf( __( 'Load %s video', 'space-lightplay' ), $provider ) );
				?>
			</button>
			<?php if ( ! empty( $attributes['consentRemember'] ) ) : ?>
				<label class="slp-consent__remember">
					<input type="checkbox" />
					<?php
					/* translators: %s: provider name. */
					echo esc_html( sprintf( __( 'Always allow %s', 'space-lightplay' ), $provider ) );
					?>
				</label>
			<?php endif; ?>
		</div>
	</div>
	<?php
	return (string) ob_get_clean();
}

/**
 * Link to the video for visitors without JavaScript.
 *
 * @param array $ctx Prepared context.
 * @return string
 */
function space_lightplay_noscript_html( $ctx ) {
	$provider = $ctx['provider'];
	/* translators: %s: provider name. */
	$label = $provider ? sprintf( __( 'Watch on %s', 'space-lightplay' ), $provider ) : __( 'Watch video', 'space-lightplay' );
	return '<noscript><a class="slp-noscript" href="' . esc_url( $ctx['watch_url'] ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( $label ) . '</a></noscript>';
}
