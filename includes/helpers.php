<?php
/**
 * Shared helpers.
 *
 * @package Space_Lightplay
 */

defined( 'ABSPATH' ) || exit;

/**
 * CSS length: "80px", "50%", "2rem", "1.5em", "10vw", "10vh", "0".
 */
function space_lightplay_sanitize_css_dimension( $value, $fallback ) {
	$value = trim( (string) $value );
	if ( preg_match( '/^\d+(\.\d+)?(px|%|rem|em|vw|vh|vmin|vmax)$/i', $value ) ) {
		return $value;
	}
	if ( is_numeric( $value ) ) {
		return $value . 'px';
	}
	return $fallback;
}

/**
 * CSS border-radius: one to four lengths ("50%", "8px 8px 0 0").
 */
function space_lightplay_sanitize_css_radius( $value, $fallback ) {
	$parts = preg_split( '/\s+/', trim( (string) $value ) );
	if ( ! $parts || count( $parts ) > 4 ) {
		return $fallback;
	}
	foreach ( $parts as $i => $part ) {
		$clean = space_lightplay_sanitize_css_dimension( $part, '' );
		if ( '' === $clean ) {
			return $fallback;
		}
		$parts[ $i ] = $clean;
	}
	return implode( ' ', $parts );
}

/**
 * CSS gradient from the core gradient picker, e.g. "linear-gradient(135deg,#fff 0%,rgba(0,0,0,.5) 100%)".
 */
function space_lightplay_sanitize_css_gradient( $value ) {
	$value = trim( (string) $value );
	if ( preg_match( '/^(repeating-)?(linear|radial|conic)-gradient\([#a-zA-Z0-9%,.()\s\/-]+\)$/', $value ) ) {
		return $value;
	}
	return '';
}

/**
 * CSS color: hex, rgb[a](), hsl[a](), var(--x), named color.
 */
function space_lightplay_sanitize_css_color( $value, $fallback ) {
	$value = trim( (string) $value );
	if ( '' === $value ) {
		return $fallback;
	}
	if ( preg_match( '/^#([A-Fa-f0-9]{3,8})$/', $value ) ) {
		return $value;
	}
	if ( preg_match( '/^(rgba?|hsla?)\(\s*[0-9a-zA-Z.,\s%\/-]+\s*\)$/i', $value ) ) {
		return $value;
	}
	if ( preg_match( '/^var\(\s*--[A-Za-z0-9_-]+(\s*,\s*[^;<>"\'(){}]+)?\s*\)$/', $value ) ) {
		return $value;
	}
	if ( preg_match( '/^[a-zA-Z][a-zA-Z-]{0,29}$/', $value ) ) {
		return $value;
	}
	return $fallback;
}

/**
 * Aspect ratio: "16/9", "16 / 9", "1.777". Returns "W/H" or decimal, or fallback.
 */
function space_lightplay_sanitize_aspect_ratio( $value, $fallback ) {
	$value = trim( (string) $value );
	if ( preg_match( '/^(\d{1,5})\s*\/\s*(\d{1,5})$/', $value, $m ) && (int) $m[1] > 0 && (int) $m[2] > 0 ) {
		return $m[1] . '/' . $m[2];
	}
	if ( preg_match( '/^\d{1,3}(\.\d{1,4})?$/', $value ) && (float) $value > 0 ) {
		return $value;
	}
	return $fallback;
}

/**
 * Width/height → "W/H", snapped to the closest standard ratio within 5 %
 * (same approach as Plyr: oEmbed reports e.g. 200×113 for 16:9 videos).
 */
function space_lightplay_ratio_from_size( $width, $height ) {
	$w = (int) $width;
	$h = (int) $height;
	if ( $w <= 0 || $h <= 0 ) {
		return '';
	}
	$standard = array( array( 1, 1 ), array( 4, 3 ), array( 3, 4 ), array( 5, 4 ), array( 4, 5 ), array( 3, 2 ), array( 2, 3 ), array( 16, 10 ), array( 10, 16 ), array( 16, 9 ), array( 9, 16 ), array( 21, 9 ), array( 9, 21 ), array( 32, 9 ), array( 9, 32 ) );
	$best     = null;
	foreach ( $standard as $pair ) {
		$diff = abs( $pair[0] / $pair[1] - $w / $h );
		if ( null === $best || $diff < $best[0] ) {
			$best = array( $diff, $pair );
		}
	}
	if ( $best[0] <= 0.05 ) {
		return $best[1][0] . '/' . $best[1][1];
	}
	$a = $w;
	$b = $h;
	while ( $b ) {
		$t = $b;
		$b = $a % $b;
		$a = $t;
	}
	return ( $w / $a ) . '/' . ( $h / $a );
}

/**
 * YouTube thumbnail URLs, largest first. The vi_webp set frequently has the
 * 1280px frame when the JPEG set only goes up to 640px or 480px.
 *
 * @param string $id Video id.
 * @return string[]
 */
function space_lightplay_youtube_thumbnails( $id ) {
	return array(
		'https://i.ytimg.com/vi_webp/' . $id . '/maxresdefault.webp',
		'https://i.ytimg.com/vi/' . $id . '/maxresdefault.jpg',
		'https://i.ytimg.com/vi_webp/' . $id . '/sddefault.webp',
		'https://i.ytimg.com/vi/' . $id . '/sddefault.jpg',
		'https://i.ytimg.com/vi/' . $id . '/hqdefault.jpg',
	);
}

/**
 * Validates a remote video id for a provider.
 */
function space_lightplay_valid_id( $source, $id ) {
	if ( 'youtube' === $source ) {
		return (bool) preg_match( '/^[A-Za-z0-9_-]{11}$/', (string) $id );
	}
	if ( 'vimeo' === $source ) {
		return (bool) preg_match( '/^\d{1,12}$/', (string) $id );
	}
	return false;
}

/**
 * Human-readable provider name.
 */
function space_lightplay_provider_label( $source ) {
	$labels = array(
		'youtube' => 'YouTube',
		'vimeo'   => 'Vimeo',
	);
	return isset( $labels[ $source ] ) ? $labels[ $source ] : '';
}

/**
 * Button presets of the removed 1.x block styles. Used only to render
 * posts saved with 1.x that have not been re-saved in the editor yet;
 * the editor migrates them to regular attributes (see editor.js).
 */
function space_lightplay_legacy_style_preset( $class_name ) {
	$presets = array(
		'minimal' => array(
			'btnSize'    => '56px',
			'btnBg'      => 'rgba(0,0,0,.35)',
			'btnBgHover' => 'rgba(0,0,0,.55)',
		),
		'bold'    => array(
			'btnSize'    => '104px',
			'btnBg'      => '#000',
			'btnBgHover' => '#000',
		),
		'glass'   => array(
			'btnBg'      => 'rgba(255,255,255,.18)',
			'btnBgHover' => 'rgba(255,255,255,.28)',
			'iconColor'  => '#fff',
			'btnBlur'    => 8,
		),
	);
	if ( preg_match( '/(?:^|\s)is-style-(minimal|bold|glass)(?:\s|$)/', (string) $class_name, $m ) ) {
		return $presets[ $m[1] ];
	}
	return array();
}
