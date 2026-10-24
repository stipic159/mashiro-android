mod commands;
mod files;
mod genius;
mod lrclib;
mod oauth;
mod proxy;
mod state;
mod sync_server;
mod together;
mod translate;
mod yandex;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("media")
                .setup(|_app, api| {
                    api.register_android_plugin("app.mashiro.client", "MediaPlugin")?;
                    Ok(())
                })
                .build(),
        );
    }

    builder
        .register_asynchronous_uri_scheme_protocol(proxy::SCHEME, |_app, request, responder| {
            proxy::handle(request, responder);
        })
        .manage(AppState::default())
        .manage(together::TogetherState::default())
        .manage(together::relay::RelayState::default())
        .invoke_handler(tauri::generate_handler![
            commands::prefetch_stream,
            commands::clear_stream_cache,
            commands::auth_login,
            commands::auth_me,
            commands::auth_logout,
            oauth::oauth_device_start,
            oauth::oauth_cancel,
            commands::get_wave,
            commands::get_wheel,
            commands::get_artist,
            commands::get_artist_tracks,
            commands::get_album,
            commands::wave_feedback,
            commands::search_tracks,
            commands::get_liked_tracks,
            commands::get_liked_ids,
            commands::get_disliked_ids,
            commands::set_like,
            commands::set_dislike,
            commands::get_stations,
            commands::station_info,
            commands::set_station_settings,
            commands::get_playlists,
            commands::get_playlist_tracks,
            commands::playlist_memberships,
            commands::playlist_add_track,
            commands::playlist_remove_track,
            commands::playlist_move_track,
            commands::playlist_create,
            commands::playlist_rename,
            commands::playlist_set_visibility,
            commands::playlist_delete,
            commands::playlist_clear,
            commands::playlist_recommendations,
            commands::search_suggest,
            commands::get_similar_tracks,
            commands::get_track,
            commands::get_track_info,
            commands::get_stream,
            commands::get_lyrics,
            commands::download_track,
            commands::download_image,
            commands::ai_check_artists,
            commands::ai_check_tracks,
            commands::default_download_dir,
            commands::find_local_track,
            commands::remove_local_track,
            commands::import_local_track,
            commands::downloads_info,
            sync_server::start_sync_server,
            sync_server::stop_sync_server,
            sync_server::is_sync_server_running,
            genius::genius_check,
            genius::genius_search,
            genius::genius_search_people,
            genius::genius_song,
            genius::genius_lookup,
            genius::genius_artist,
            genius::genius_clear_cache,
            lrclib::lrclib_lookup,
            lrclib::lrclib_clear_cache,
            translate::translate_lines,
            translate::translate_clear_cache,
            together::commands::together_host,
            together::commands::together_join,
            together::commands::together_leave,
            together::commands::together_send,
            together::commands::together_status,
            together::commands::together_peer_address,
            together::commands::together_log_path,
            together::relay::commands::together_relay_create,
            together::relay::commands::together_relay_join,
            together::relay::commands::together_relay_leave,
            together::relay::commands::together_relay_send,
            together::relay::commands::together_relay_handoff,
            together::relay::commands::together_relay_status,
            together::relay::commands::together_relay_seed_exists,
            together::relay::commands::together_relay_seed_show,
            together::relay::commands::together_relay_seed_set,
            together::relay::commands::together_relay_seed_new,
            together::relay::commands::together_relay_seed_forget,
            together::relay::commands::together_relay_identity,
            together::relay::commands::together_relay_invite,
            files::export_text_file,
            files::read_text_file,
            files::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mashiro");
}
