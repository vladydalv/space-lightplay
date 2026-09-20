<?php
/**
 * REST endpoint that copies a remote video thumbnail into the Media Library,
 * so the frontend never requests images from YouTube/Vimeo before consent.
 *
 * @package Space_Lightplay
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'space-lightplay/v1',
			'/poster',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'space_lightplay_rest_poster',
				'permission_callback' => function () {
					return current_user_can( 'upload_files' );
				},
				'args'                => array(
					'source' => array(
						'type'     => 'string',
						'enum'     => array( 'youtube', 'vimeo' ),
						'required' => true,
					),
					'id'     => array(
						'type'     => 'string',
						'required' => true,
					),
					'hash'   => array(
						'type'    => 'string',
						'default' => '',
					),
				),
			)
		);
	}
);

/**
 * Handles POST /space-lightplay/v1/poster.
 *
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response|WP_Error
 */
function space_lightplay_rest_poster( WP_REST_Request $request ) {
	$source = $request['source'];
	$id     = (string) $request['id'];
	$hash   = preg_replace( '/[^A-Za-z0-9]/', '', (string) $request['hash'] );

	if ( ! space_lightplay_valid_id( $source, $id ) ) {
		return new WP_Error( 'space_lightplay_invalid_id', __( 'Invalid video ID.', 'space-lightplay' ), array( 'status' => 400 ) );
	}

	$page_url = 'youtube' === $source
		? 'https://www.youtube.com/watch?v=' . $id
		: 'https://vimeo.com/' . $id . ( $hash ? '/' . $hash : '' );

	$oembed = _wp_oembed_get_object()->get_data( $page_url, array( 'width' => 1280 ) );
	$title  = ( $oembed && ! empty( $oembed->title ) ) ? sanitize_text_field( $oembed->title ) : '';
	$ratio  = $oembed ? space_lightplay_ratio_from_size( $oembed->width ?? 0, $oembed->height ?? 0 ) : '';
	$video  = array(
		'title'    => $title,
		'ratio'    => $ratio,
		'duration' => ( $oembed && ! empty( $oembed->duration ) ) ? (int) $oembed->duration : 0, // Vimeo only; YouTube oEmbed has none.
	);

	$key      = $source . ':' . $id;
	$existing = get_posts(
		array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'meta_key'       => '_space_lightplay_source', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	$existing_id    = $existing ? (int) $existing[0] : 0;
	$existing_width = 0;
	if ( $existing_id ) {
		$existing_meta  = wp_get_attachment_metadata( $existing_id );
		$existing_width = isset( $existing_meta['width'] ) ? (int) $existing_meta['width'] : 0;
		// Reuse unless it is a low-resolution YouTube frame that may be upgradable.
		if ( 'youtube' !== $source || $existing_width >= 1280 ) {
			return rest_ensure_response( space_lightplay_poster_payload( $existing_id, $video ) );
		}
	}

	$candidates = array();
	if ( 'youtube' === $source ) {
		// Largest first. The WebP set (vi_webp) often has the 1280px frame when the JPEG set does not.
		$candidates = space_lightplay_youtube_thumbnails( $id );
	} elseif ( $oembed && ! empty( $oembed->thumbnail_url ) ) {
		$candidates[] = esc_url_raw( $oembed->thumbnail_url );
	}

	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';

	foreach ( $candidates as $candidate ) {
		$tmp = download_url( $candidate, 15 );
		if ( is_wp_error( $tmp ) ) {
			continue;
		}
		$mime = wp_get_image_mime( $tmp );
		// YouTube answers missing sizes with a 120px placeholder image — skip those.
		$dims = wp_getimagesize( $tmp );
		if ( ! $dims || (int) $dims[0] <= 120 ) {
			wp_delete_file( $tmp );
			continue;
		}
		// Not larger than the copy we already have: keep that one, no duplicate.
		if ( $existing_id && (int) $dims[0] <= $existing_width ) {
			wp_delete_file( $tmp );
			return rest_ensure_response( space_lightplay_poster_payload( $existing_id, $video ) );
		}
		$ext  = array(
			'image/jpeg' => 'jpg',
			'image/png'  => 'png',
			'image/webp' => 'webp',
		);
		if ( ! $mime || ! isset( $ext[ $mime ] ) ) {
			wp_delete_file( $tmp );
			continue;
		}
		// YouTube sd/hq frames are 4:3 with black bars around a 16:9 picture — cut the bars off.
		if ( 'youtube' === $source && false === strpos( $candidate, 'maxres' ) && ( '' === $ratio || '16/9' === $ratio ) ) {
			$tmp = space_lightplay_crop_letterbox( $tmp, $mime );
		}
		$attachment_id = media_handle_sideload(
			array(
				'name'     => 'video-' . $source . '-' . $id . '.' . $ext[ $mime ],
				'tmp_name' => $tmp,
			),
			0,
			$title
		);
		if ( is_wp_error( $attachment_id ) ) {
			wp_delete_file( $tmp );
			continue;
		}
		update_post_meta( $attachment_id, '_space_lightplay_source', $key );
		if ( $title ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', $title );
		}
		return rest_ensure_response( space_lightplay_poster_payload( $attachment_id, $video ) );
	}

	return new WP_Error( 'space_lightplay_no_thumbnail', __( 'Could not fetch a thumbnail for this video.', 'space-lightplay' ), array( 'status' => 502 ) );
}

/**
 * Response body for the poster endpoint.
 *
 * @param int   $attachment_id Poster attachment.
 * @param array $video         Video title, ratio and duration from oEmbed.
 * @return array
 */
function space_lightplay_poster_payload( $attachment_id, $video ) {
	return array(
		'id'       => $attachment_id,
		'url'      => wp_get_attachment_image_url( $attachment_id, 'full' ),
		'alt'      => (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
		'title'    => $video['title'],
		'ratio'    => $video['ratio'],
		'duration' => $video['duration'],
	);
}

/**
 * Crops a 4:3 letterboxed frame to its 16:9 centre. Returns the (possibly new) file path.
 *
 * @param string $file Path to the image.
 * @param string $mime Image mime type.
 * @return string
 */
function space_lightplay_crop_letterbox( $file, $mime ) {
	$editor = wp_get_image_editor( $file );
	if ( is_wp_error( $editor ) ) {
		return $file;
	}
	$size = $editor->get_size();
	$w    = (int) $size['width'];
	$h    = (int) $size['height'];
	if ( ! $w || ! $h || abs( $w / $h - 4 / 3 ) > 0.02 ) {
		return $file;
	}
	$new_h = (int) round( $w * 9 / 16 );
	if ( is_wp_error( $editor->crop( 0, (int) round( ( $h - $new_h ) / 2 ), $w, $new_h ) ) ) {
		return $file;
	}
	$saved = $editor->save( $file, $mime );
	if ( is_wp_error( $saved ) || empty( $saved['path'] ) ) {
		return $file;
	}
	if ( $saved['path'] !== $file ) {
		wp_delete_file( $file );
	}
	return $saved['path'];
}
