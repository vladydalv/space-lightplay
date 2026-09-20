<?php
/**
 * Server render for space-lightplay/video.
 *
 * @package Space_Lightplay
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner blocks HTML (unused; the end screen is placed in its layer).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- Variables are scoped to the render callback.

// "background" is kept only for blocks saved by early 2.0 builds; new ones use the Background block.
$mode = in_array( $attributes['mode'], array( 'click', 'lightbox', 'scroll', 'background' ), true ) ? $attributes['mode'] : 'click';
$ctx  = space_lightplay_prepare( $attributes, $block, $mode );
if ( ! $ctx ) {
	return '';
}
$attributes = $ctx['attributes'];

$vars                  = array(
	'--slp-btn-size'       => space_lightplay_sanitize_css_dimension( $attributes['btnSize'], '80px' ),
	'--slp-btn-radius'     => space_lightplay_sanitize_css_radius( $attributes['btnRadius'], '50%' ),
	'--slp-icon-corner'    => max( 0, min( 20, (int) $attributes['iconCornerRadius'] ) ),
	'--slp-btn-blur'       => max( 0, min( 40, (int) $attributes['btnBlur'] ) ) . 'px',
	'--slp-lightbox-width' => space_lightplay_sanitize_css_dimension( $attributes['lightboxWidth'], '1200px' ),
);
$stage_style = $ctx['stage_style'];
foreach ( $vars as $prop => $val ) {
	$stage_style .= $prop . ':' . $val . ';';
}

$wrapper = get_block_wrapper_attributes(
	array_merge(
		array(
			'class'            => trim( 'space-lightplay slp-mode-' . $mode . ( $attributes['pulse'] ? ' has-pulse' : '' ) . $ctx['ratio_class'] ),
			'style'            => $ctx['ratio_style'],
			'data-sound'       => ( 'scroll' === $mode && ! empty( $attributes['scrollSound'] ) ) ? '1' : '0',
			'data-label-close' => 'lightbox' === $mode ? __( 'Close video', 'space-lightplay' ) : '',
		),
		$ctx['data']
	)
);

if ( 'scroll' === $mode || 'background' === $mode ) {
	wp_enqueue_script( 'space-lightplay-observe' );
}
if ( 'lightbox' === $mode ) {
	wp_enqueue_script( 'space-lightplay-lightbox' );
}

// End screen (child block). Not used in background mode: the video loops.
$end = '';
if ( 'background' !== $mode ) {
	foreach ( $block->inner_blocks as $inner ) {
		if ( 'space-lightplay/end-screen' === $inner->name ) {
			$end .= $inner->render();
		}
	}
}

$title = $ctx['title'];
/* translators: %s: video title. */
$play_label = $title ? sprintf( __( 'Play video: %s', 'space-lightplay' ), $title ) : __( 'Play video', 'space-lightplay' );
?>
<figure <?php echo $wrapper; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by core. ?>>
	<div class="slp-stage" style="<?php echo esc_attr( $stage_style ); ?>">
		<div class="slp-media"><?php echo $ctx['poster']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built from escaped parts / core image markup. ?></div>

		<?php if ( 'background' !== $mode ) : ?>
			<button type="button" class="slp-play space-lightplay-btn" aria-label="<?php echo esc_attr( $play_label ); ?>"<?php echo 'lightbox' === $mode ? ' aria-haspopup="dialog"' : ''; ?>>
				<span class="slp-play__icon space-lightplay-icon" aria-hidden="true">
					<svg viewBox="0 0 100 100" focusable="false"><polygon points="20,10 20,90 90,50" /></svg>
				</span>
			</button>
		<?php endif; ?>

		<?php if ( 'scroll' === $mode ) : ?>
			<button type="button" class="slp-ctrl slp-unmute" hidden>
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
				<span><?php esc_html_e( 'Turn sound on', 'space-lightplay' ); ?></span>
			</button>
		<?php endif; ?>

		<?php echo space_lightplay_consent_html( $ctx ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped inside. ?>

		<?php echo $end; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Rendered block markup. ?>
	</div>
	<?php echo space_lightplay_noscript_html( $ctx ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped inside. ?>
</figure>
