<?php
/**
 * Server render for space-lightplay/background.
 *
 * @package Space_Lightplay
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner blocks HTML (the content on top of the video).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- Variables are scoped to the render callback.

$ctx = space_lightplay_prepare( $attributes, $block, 'background' );
if ( ! $ctx ) {
	// No video yet: still show the content, like core/cover without media.
	return '<div ' . get_block_wrapper_attributes( array( 'class' => 'slp-bg' ) ) . '>' . $content . '</div>';
}

wp_enqueue_script( 'space-lightplay-observe' );

$wrapper = get_block_wrapper_attributes(
	array_merge(
		array(
			'class'       => 'slp-bg slp-mode-background' . $ctx['ratio_class'],
			'style'       => $ctx['ratio_style'],
			'data-mobile' => empty( $attributes['playOnMobile'] ) ? '0' : '1',
		),
		$ctx['data']
	)
);
?>
<div <?php echo $wrapper; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by core. ?>>
	<div class="slp-stage" aria-hidden="true" style="<?php echo esc_attr( $ctx['stage_style'] ); ?>">
		<div class="slp-media"><?php echo $ctx['poster']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built from escaped parts / core image markup. ?></div>
		<span class="slp-bg__overlay"></span>
	</div>
	<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Rendered inner blocks. ?>
	<?php echo space_lightplay_consent_html( $ctx ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped inside. ?>
</div>
