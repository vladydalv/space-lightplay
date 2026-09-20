<?php
/**
 * Plugin Name:       Space Lightplay
 * Description:       Lightweight video block for YouTube, Vimeo and self-hosted video. Nothing external loads until the visitor asks for it.
 * Version:           2.0.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            Vlad Zelinskyi
 * Author URI:        https://www.spacenerd.space/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       space-lightplay
 */

defined( 'ABSPATH' ) || exit;

define( 'SPACE_LIGHTPLAY_VERSION', '2.0.0' );
define( 'SPACE_LIGHTPLAY_FILE', __FILE__ );
define( 'SPACE_LIGHTPLAY_DIR', plugin_dir_path( __FILE__ ) );
define( 'SPACE_LIGHTPLAY_URL', plugin_dir_url( __FILE__ ) );

require_once SPACE_LIGHTPLAY_DIR . 'includes/helpers.php';
require_once SPACE_LIGHTPLAY_DIR . 'includes/rest.php';
require_once SPACE_LIGHTPLAY_DIR . 'includes/render.php';

/**
 * Registers assets first (block.json references them by handle), then the blocks.
 */
function space_lightplay_register() {
	$url = SPACE_LIGHTPLAY_URL . 'assets/';
	// Version per file = plugin version + file modification time, so browsers never keep a stale copy.
	$ver = function ( $file ) {
		$path = SPACE_LIGHTPLAY_DIR . 'assets/' . $file;
		return SPACE_LIGHTPLAY_VERSION . ( file_exists( $path ) ? '.' . filemtime( $path ) : '' );
	};

	wp_register_script(
		'space-lightplay-editor',
		$url . 'editor.js',
		array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n', 'wp-data', 'wp-api-fetch', 'wp-compose', 'wp-core-data' ),
		$ver( 'editor.js' ),
		true
	);
	wp_set_script_translations( 'space-lightplay-editor', 'space-lightplay', SPACE_LIGHTPLAY_DIR . 'languages' );

	// Minified builds of view*.js (sources ship alongside; SCRIPT_DEBUG loads them).
	// Rebuild after editing: npx terser assets/view.js -c -m -o assets/view.min.js (same for view-observe, view-lightbox).
	$min       = ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ? '' : '.min';
	$view_args = array(
		'in_footer' => true,
		'strategy'  => 'defer',
	);
	wp_register_script( 'space-lightplay-view', $url . 'view' . $min . '.js', array(), $ver( 'view' . $min . '.js' ), $view_args );
	wp_register_script( 'space-lightplay-observe', $url . 'view-observe' . $min . '.js', array( 'space-lightplay-view' ), $ver( 'view-observe' . $min . '.js' ), $view_args );
	wp_register_script( 'space-lightplay-lightbox', $url . 'view-lightbox' . $min . '.js', array( 'space-lightplay-view' ), $ver( 'view-lightbox' . $min . '.js' ), $view_args );

	wp_register_style( 'space-lightplay-style', $url . 'style.css', array(), $ver( 'style.css' ) );
	wp_register_style( 'space-lightplay-editor-style', $url . 'editor.css', array(), $ver( 'editor.css' ) );

	register_block_type_from_metadata( SPACE_LIGHTPLAY_DIR . 'blocks/video' );
	register_block_type_from_metadata( SPACE_LIGHTPLAY_DIR . 'blocks/end-screen' );
	register_block_type_from_metadata( SPACE_LIGHTPLAY_DIR . 'blocks/background' );
}
add_action( 'init', 'space_lightplay_register' );

/**
 * Enables the native aspect-ratio, width and border-radius controls for this block
 * even on themes that do not opt into appearance tools. Uses the "blocks"
 * origin, so a theme's own theme.json can still override it.
 *
 * @param WP_Theme_JSON_Data $theme_json Theme JSON data object.
 * @return WP_Theme_JSON_Data
 */
function space_lightplay_theme_json( $theme_json ) {
	return $theme_json->update_with(
		array(
			'version'  => WP_Theme_JSON::LATEST_SCHEMA,
			'settings' => array(
				'blocks' => array(
					'space-lightplay/background' => array(
						'dimensions' => array(
							'aspectRatio' => true,
							'minHeight'   => true,
							'width'       => true,
						),
						'border'     => array( 'radius' => true ),
					),
					'space-lightplay/video' => array(
						'dimensions' => array(
							'aspectRatio' => true,
							'width'       => true,
						),
						'border'     => array( 'radius' => true ),
					),
				),
			),
		)
	);
}
add_filter( 'wp_theme_json_data_blocks', 'space_lightplay_theme_json' );
