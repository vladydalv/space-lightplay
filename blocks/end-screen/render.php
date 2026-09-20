<?php
/**
 * Server render for space-lightplay/end-screen.
 *
 * @package Space_Lightplay
 *
 * @var array  $attributes Block attributes.
 * @var string $content    Inner blocks HTML.
 */

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- Scoped to the render callback.
$wrapper = get_block_wrapper_attributes( array( 'class' => 'slp-end' ) );
$label   = trim( (string) ( $attributes['replayLabel'] ?? '' ) );
$label   = '' !== $label ? $label : __( 'Replay', 'space-lightplay' );
?>
<div <?php echo $wrapper; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by core. ?>>
	<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Rendered inner blocks. ?>
	<?php if ( ! empty( $attributes['showReplay'] ) ) : ?>
		<button type="button" class="slp-replay">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" /></svg>
			<span><?php echo esc_html( $label ); ?></span>
		</button>
	<?php endif; ?>
</div>
