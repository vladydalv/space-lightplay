<?php
/**
 * Space Lightplay uninstall.
 *
 * The plugin stores no options, transients or tables. Posters it copied into
 * the Media Library stay (they are the site's images and may be used elsewhere);
 * only the plugin's own bookkeeping meta on them is removed.
 *
 * @package Space_Lightplay
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_post_meta_by_key( '_space_lightplay_source' );
